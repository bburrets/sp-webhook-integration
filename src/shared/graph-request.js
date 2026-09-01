/**
 * Graph Request Helper
 * A thin axios wrapper that honours Retry-After on throttling responses.
 *
 * Existing Graph calls in this codebase have no 429 handling at all
 * (axios-retry is wired only for UiPath, in uipath-queue-client.js). That was
 * survivable when a notification meant one small list read. The rename sweep
 * lists a folder and downloads every candidate file, which is a much heavier
 * Graph consumer, so these paths retry properly.
 *
 * Deliberate limit: if Graph asks us to wait longer than MAX_RETRY_AFTER_MS we
 * give up rather than sleep. The queue's visibility timeout is 3 minutes and the
 * Consumption function timeout is 5, so a long in-process sleep would get the
 * invocation killed mid-work and the message redelivered anyway. Failing fast
 * lets the queue's own retry schedule handle the backoff.
 */

const axios = require('axios');
const { createLogger } = require('./logger');

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_TIMEOUT_MS = 60000;
const BASE_BACKOFF_MS = 1000;
const MAX_RETRY_AFTER_MS = 60000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Parse a Retry-After header, which may be seconds or an HTTP date.
 * @param {string|undefined} header
 * @returns {number|null} Milliseconds to wait, or null if unparseable
 */
function parseRetryAfter(header) {
    if (header === undefined || header === null || header === '') {
        return null;
    }

    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.round(seconds * 1000);
    }

    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
        return Math.max(0, date - Date.now());
    }

    return null;
}

/**
 * How long to wait before retry `attempt` (1-based), and whether to bother.
 * @param {Object} error - Axios error
 * @param {number} attempt
 * @returns {{retry: boolean, delayMs: number, reason: string}}
 */
function retryDecision(error, attempt) {
    const status = error.response?.status;

    // No response at all: network error or timeout. Worth retrying.
    if (!status) {
        return {
            retry: true,
            delayMs: BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
            reason: error.code || 'network-error'
        };
    }

    if (!RETRYABLE_STATUS.has(status)) {
        return { retry: false, delayMs: 0, reason: `non-retryable status ${status}` };
    }

    const retryAfterMs = parseRetryAfter(error.response.headers?.['retry-after']);

    if (retryAfterMs !== null) {
        if (retryAfterMs > MAX_RETRY_AFTER_MS) {
            return {
                retry: false,
                delayMs: 0,
                reason: `Retry-After ${Math.round(retryAfterMs / 1000)}s exceeds in-process wait budget`
            };
        }
        return { retry: true, delayMs: retryAfterMs, reason: `Retry-After on ${status}` };
    }

    // Exponential backoff with jitter, so a burst of parallel workers hitting
    // the same throttle do not retry in lockstep.
    const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * BASE_BACKOFF_MS);
    return { retry: true, delayMs: backoff + jitter, reason: `backoff on ${status}` };
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Issue a Graph request with throttle-aware retries.
 *
 * @param {Object} params
 * @param {string} params.url - Absolute URL
 * @param {string} [params.method='get']
 * @param {string} [params.accessToken] - Omit for pre-signed URLs, which must
 *   not carry an Authorization header
 * @param {Object} [params.data] - Request body
 * @param {string} [params.responseType] - e.g. 'arraybuffer' for downloads
 * @param {number} [params.timeout]
 * @param {number} [params.maxRetries]
 * @param {Object} [params.context] - Azure Functions context, for logging
 * @returns {Promise<Object>} Axios response
 */
async function graphRequest({
    url,
    method = 'get',
    accessToken = null,
    data = undefined,
    responseType = undefined,
    timeout = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    context = null
}) {
    const logger = createLogger(context);
    const headers = { Accept: 'application/json' };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    if (data !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        try {
            return await axios({ url, method, headers, data, responseType, timeout });
        } catch (error) {
            lastError = error;
            const isLastAttempt = attempt === maxRetries + 1;
            const decision = retryDecision(error, attempt);

            if (!decision.retry || isLastAttempt) {
                logger.error('Graph request failed', {
                    service: 'graph-request',
                    method,
                    url,
                    status: error.response?.status || null,
                    attempt,
                    reason: isLastAttempt ? 'retries exhausted' : decision.reason,
                    error: error.message
                });
                throw error;
            }

            logger.warn('Graph request retrying', {
                service: 'graph-request',
                method,
                url,
                status: error.response?.status || null,
                attempt,
                delayMs: decision.delayMs,
                reason: decision.reason
            });

            await sleep(decision.delayMs);
        }
    }

    throw lastError;
}

module.exports = {
    graphRequest,
    parseRetryAfter,
    retryDecision,
    MAX_RETRY_AFTER_MS,
    RETRYABLE_STATUS
};
