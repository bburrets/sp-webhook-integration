jest.mock('axios', () => jest.fn());
jest.mock('../logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const axios = require('axios');
const { graphRequest, parseRetryAfter, retryDecision, MAX_RETRY_AFTER_MS } = require('../graph-request');

/** An axios-shaped rejection. */
function httpError(status, headers = {}, data = undefined) {
    const error = new Error(`HTTP ${status}`);
    error.response = { status, headers, data };
    return error;
}

describe('graph-request', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /** Drain pending timers so retry sleeps resolve under fake timers. */
    async function settle(promise) {
        const tick = async () => {
            for (let i = 0; i < 20; i += 1) {
                await Promise.resolve();
                jest.runOnlyPendingTimers();
            }
        };
        const result = promise.catch((error) => ({ __error: error }));
        await tick();
        const settled = await result;
        if (settled && settled.__error) {
            throw settled.__error;
        }
        return settled;
    }

    describe('parseRetryAfter', () => {
        it('parses a seconds value', () => {
            expect(parseRetryAfter('120')).toBe(120000);
            expect(parseRetryAfter('0')).toBe(0);
        });

        it('parses an HTTP date', () => {
            const future = new Date(Date.now() + 5000).toUTCString();
            expect(parseRetryAfter(future)).toBeGreaterThan(3000);
        });

        it('returns null for missing or unparseable values', () => {
            expect(parseRetryAfter(undefined)).toBeNull();
            expect(parseRetryAfter('')).toBeNull();
            expect(parseRetryAfter('soon')).toBeNull();
        });

        it('never returns a negative wait for a past date', () => {
            expect(parseRetryAfter(new Date(Date.now() - 60000).toUTCString())).toBe(0);
        });
    });

    describe('retryDecision', () => {
        it('honours Retry-After within the wait budget', () => {
            const decision = retryDecision(httpError(429, { 'retry-after': '5' }), 1);
            expect(decision).toMatchObject({ retry: true, delayMs: 5000 });
        });

        it('refuses to sleep longer than the wait budget', () => {
            const seconds = String(MAX_RETRY_AFTER_MS / 1000 + 60);
            const decision = retryDecision(httpError(429, { 'retry-after': seconds }), 1);
            expect(decision.retry).toBe(false);
            expect(decision.reason).toMatch(/exceeds in-process wait budget/);
        });

        it('does not retry a client error', () => {
            expect(retryDecision(httpError(404), 1).retry).toBe(false);
            expect(retryDecision(httpError(403), 1).retry).toBe(false);
            expect(retryDecision(httpError(400), 1).retry).toBe(false);
        });

        it('retries server errors with backoff', () => {
            const first = retryDecision(httpError(503), 1);
            const later = retryDecision(httpError(503), 3);
            expect(first.retry).toBe(true);
            expect(later.delayMs).toBeGreaterThan(first.delayMs);
        });

        it('retries a network error with no response', () => {
            const decision = retryDecision({ code: 'ECONNRESET' }, 1);
            expect(decision).toMatchObject({ retry: true, reason: 'ECONNRESET' });
        });
    });

    describe('graphRequest', () => {
        it('returns the response on success', async () => {
            axios.mockResolvedValue({ data: { value: [1] } });
            const response = await settle(graphRequest({ url: 'https://g/x', accessToken: 't' }));
            expect(response.data.value).toEqual([1]);
            expect(axios).toHaveBeenCalledTimes(1);
        });

        it('sends the bearer token when one is given', async () => {
            axios.mockResolvedValue({ data: {} });
            await settle(graphRequest({ url: 'https://g/x', accessToken: 'tok' }));
            expect(axios.mock.calls[0][0].headers.Authorization).toBe('Bearer tok');
        });

        it('omits Authorization for a pre-signed URL', async () => {
            // A pre-signed download URL rejects or ignores an auth header.
            axios.mockResolvedValue({ data: {} });
            await settle(graphRequest({ url: 'https://presigned', accessToken: null }));
            expect(axios.mock.calls[0][0].headers.Authorization).toBeUndefined();
        });

        it('sets a JSON content type only when there is a body', async () => {
            axios.mockResolvedValue({ data: {} });
            await settle(graphRequest({ url: 'https://g/x', method: 'patch', accessToken: 't', data: { name: 'a' } }));
            expect(axios.mock.calls[0][0].headers['Content-Type']).toBe('application/json');

            axios.mockClear();
            await settle(graphRequest({ url: 'https://g/x', accessToken: 't' }));
            expect(axios.mock.calls[0][0].headers['Content-Type']).toBeUndefined();
        });

        it('retries a throttled request and then succeeds', async () => {
            axios
                .mockRejectedValueOnce(httpError(429, { 'retry-after': '1' }))
                .mockResolvedValueOnce({ data: { ok: true } });
            const response = await settle(graphRequest({ url: 'https://g/x', accessToken: 't' }));
            expect(response.data.ok).toBe(true);
            expect(axios).toHaveBeenCalledTimes(2);
        });

        it('does not retry a non-retryable status', async () => {
            axios.mockRejectedValue(httpError(404));
            await expect(settle(graphRequest({ url: 'https://g/x', accessToken: 't' }))).rejects.toThrow('HTTP 404');
            expect(axios).toHaveBeenCalledTimes(1);
        });

        it('gives up after maxRetries and rethrows', async () => {
            axios.mockRejectedValue(httpError(503));
            await expect(
                settle(graphRequest({ url: 'https://g/x', accessToken: 't', maxRetries: 2 }))
            ).rejects.toThrow('HTTP 503');
            expect(axios).toHaveBeenCalledTimes(3);
        });

        it('passes responseType through for downloads', async () => {
            axios.mockResolvedValue({ data: Buffer.from('pdf') });
            await settle(graphRequest({ url: 'https://g/x', accessToken: 't', responseType: 'arraybuffer' }));
            expect(axios.mock.calls[0][0].responseType).toBe('arraybuffer');
        });
    });
});
