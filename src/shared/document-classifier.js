/**
 * Document Classifier
 * Scores a file against every active rule set and returns the single best
 * match, or null.
 *
 * Content patterns are weighted above filename hints because filenames are the
 * least trustworthy signal here — the whole reason this feature exists is that
 * the names in this folder are wrong. A file called "check_scan.pdf" that reads
 * as a wire transfer should classify as WIRE.
 *
 * Ties return null rather than picking arbitrarily. A wrong classification
 * produces a confidently wrong filename, which is worse than an exception a
 * human resolves.
 */

const { getRuleSets } = require('./document-type-rules');
const { getStem, getExtension } = require('./document-naming-engine');

const CONTENT_MATCH_WEIGHT = 2;
const FILENAME_HINT_WEIGHT = 1;

/**
 * Score one rule set against a file.
 * @param {Object} params
 * @param {string} params.fileName
 * @param {string} params.text
 * @param {Object} params.ruleSet
 * @returns {{type: string, score: number, signals: number, filenameHit: boolean, contentMatches: number, eligible: boolean}}
 */
function scoreRuleSet({ fileName, text, ruleSet }) {
    const stem = getStem(fileName || '').toLowerCase();
    const source = text === null || text === undefined ? '' : String(text);

    const filenameHit = ruleSet.classify.filenameHints.some((hint) => stem.includes(hint));
    const contentMatches = ruleSet.classify.contentRegexes
        .filter((regex) => regex.test(source))
        .length;

    // A matched filename counts as one signal no matter how many hints hit, so
    // a rule set cannot inflate its confidence by listing hint synonyms.
    const signals = (filenameHit ? 1 : 0) + contentMatches;
    const score = contentMatches * CONTENT_MATCH_WEIGHT + (filenameHit ? FILENAME_HINT_WEIGHT : 0);

    return {
        type: ruleSet.type,
        score,
        signals,
        filenameHit,
        contentMatches,
        eligible: signals >= ruleSet.classify.minMatches
    };
}

/**
 * Classify a document.
 * @param {Object} params
 * @param {string} params.fileName
 * @param {string} params.text - Extracted document text ('' is valid: the
 *   classifier then works from the filename alone)
 * @param {Object[]} [params.ruleSets] - Defaults to all active rule sets
 * @returns {{type: string|null, ruleSet: Object|null, score: number, ambiguous: boolean, scores: Object[], reason: string|null}}
 */
function classify({ fileName, text, ruleSets } = {}) {
    const sets = ruleSets || getRuleSets();
    const ext = getExtension(fileName || '');

    // Only consider rule sets that accept this file's extension.
    const applicable = sets.filter((ruleSet) => ruleSet.extensions.includes(ext));

    if (applicable.length === 0) {
        return {
            type: null,
            ruleSet: null,
            score: 0,
            ambiguous: false,
            scores: [],
            reason: ext
                ? `No document type accepts the extension "${ext}"`
                : 'File has no extension'
        };
    }

    const scores = applicable
        .map((ruleSet) => scoreRuleSet({ fileName, text, ruleSet }))
        .sort((a, b) => b.score - a.score);

    const candidates = scores.filter((entry) => entry.eligible);

    if (candidates.length === 0) {
        return {
            type: null,
            ruleSet: null,
            score: 0,
            ambiguous: false,
            scores,
            reason: 'No document type matched enough classification signals'
        };
    }

    const best = candidates[0];
    const tied = candidates.filter((entry) => entry.score === best.score);

    if (tied.length > 1) {
        return {
            type: null,
            ruleSet: null,
            score: best.score,
            ambiguous: true,
            scores,
            reason: `Ambiguous classification, tied between: ${tied.map((t) => t.type).join(', ')}`
        };
    }

    return {
        type: best.type,
        ruleSet: applicable.find((ruleSet) => ruleSet.type === best.type),
        score: best.score,
        ambiguous: false,
        scores,
        reason: null
    };
}

module.exports = {
    classify,
    scoreRuleSet,
    CONTENT_MATCH_WEIGHT,
    FILENAME_HINT_WEIGHT
};
