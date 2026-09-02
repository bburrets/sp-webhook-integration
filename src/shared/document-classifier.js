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

// The folder outranks everything: this library is organised by document type,
// so a file under CHECK/ is a check no matter what its name or a stray content
// pattern suggests. Content still outranks the filename, because the filenames
// are the thing being corrected.
const FOLDER_HINT_WEIGHT = 4;
const CONTENT_MATCH_WEIGHT = 2;
const FILENAME_HINT_WEIGHT = 1;

/**
 * Score one rule set against a file.
 * @param {Object} params
 * @param {string} params.fileName
 * @param {string} params.text
 * @param {string} [params.folderPath] - Drive-root-relative folder of the file
 * @param {Object} params.ruleSet
 * @returns {{type: string, score: number, signals: number, folderHit: boolean, filenameHit: boolean, contentMatches: number, eligible: boolean}}
 */
function scoreRuleSet({ fileName, text, folderPath, ruleSet }) {
    const stem = getStem(fileName || '').toLowerCase();
    const source = text === null || text === undefined ? '' : String(text);

    // Whole-segment match, not substring: a folder called "CHECKLIST" is not
    // the CHECK folder.
    const segments = String(folderPath || '')
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.toLowerCase());
    const folderHit = ruleSet.classify.folderHints.some((hint) => segments.includes(hint));

    const filenameHit = ruleSet.classify.filenameHints.some((hint) => stem.includes(hint));
    const contentMatches = ruleSet.classify.contentRegexes
        .filter((regex) => regex.test(source))
        .length;

    // A matched folder or filename counts as one signal no matter how many hints
    // hit, so a rule set cannot inflate its confidence by listing synonyms.
    const signals = (folderHit ? 1 : 0) + (filenameHit ? 1 : 0) + contentMatches;
    const score = (folderHit ? FOLDER_HINT_WEIGHT : 0)
        + contentMatches * CONTENT_MATCH_WEIGHT
        + (filenameHit ? FILENAME_HINT_WEIGHT : 0);

    return {
        type: ruleSet.type,
        score,
        signals,
        folderHit,
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
 *   classifier then works from the folder and filename alone)
 * @param {string} [params.folderPath] - Drive-root-relative folder of the file
 * @param {Object[]} [params.ruleSets] - Defaults to all active rule sets
 * @returns {{type: string|null, ruleSet: Object|null, score: number, ambiguous: boolean, scores: Object[], reason: string|null}}
 */
function classify({ fileName, text, folderPath, ruleSets } = {}) {
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
        .map((ruleSet) => scoreRuleSet({ fileName, text, folderPath, ruleSet }))
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
    FOLDER_HINT_WEIGHT,
    CONTENT_MATCH_WEIGHT,
    FILENAME_HINT_WEIGHT
};
