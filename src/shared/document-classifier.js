/**
 * Document Classifier
 * Scores a file against every active rule set and returns the single best
 * match, or null.
 *
 * CONTENT DECIDES. The document itself is classified first, from its text and
 * filename alone. The folder it sits in is consulted only when that produces no
 * answer -- nothing matched, or two types tied. So a misfiled document is
 * classified by what it actually is, and the folder serves as a safety net for
 * documents whose OCR is too degraded to carry any marker at all.
 *
 * Measured against real OCR text from this library (test/fixtures/ocr-samples.js),
 * content alone identifies all four types correctly and declines unrelated
 * documents. The folder fallback exists for the tail, not the common case.
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

// Only used in the fallback pass, where it is the sole remaining signal.
// Content still outranks the filename, because the filenames are the thing
// being corrected.
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
function scoreRuleSet({ fileName, text, folderPath, useFolderHints = true, ruleSet }) {
    const stem = getStem(fileName || '').toLowerCase();
    const source = text === null || text === undefined ? '' : String(text);

    // Whole-segment match, not substring: a folder called "CHECKLIST" is not
    // the CHECK folder.
    const segments = String(folderPath || '')
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.toLowerCase());
    const folderHit = useFolderHints
        && ruleSet.classify.folderHints.some((hint) => segments.includes(hint));

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
 * @param {boolean} [params.folderFallback=true] - Consult the folder when the
 *   document itself is inconclusive. Set false for pure content classification.
 * @returns {{type: string|null, ruleSet: Object|null, score: number, ambiguous: boolean, via: string|null, scores: Object[], reason: string|null}}
 */
function classify({ fileName, text, folderPath, ruleSets, folderFallback = true } = {}) {
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
            via: null,
            scores: [],
            reason: ext
                ? `No document type accepts the extension "${ext}"`
                : 'File has no extension'
        };
    }

    /** One scoring pass, with or without the folder signal. */
    const pass = (useFolderHints) => {
        const scores = applicable
            .map((ruleSet) => scoreRuleSet({ fileName, text, folderPath, useFolderHints, ruleSet }))
            .sort((a, b) => b.score - a.score);

        const candidates = scores.filter((entry) => entry.eligible);

        if (candidates.length === 0) {
            return { decided: false, scores, tied: [] };
        }

        const best = candidates[0];
        const tied = candidates.filter((entry) => entry.score === best.score);

        return { decided: tied.length === 1, best, scores, tied };
    };

    // Pass 1: the document on its own merits.
    const byContent = pass(false);
    if (byContent.decided) {
        return {
            type: byContent.best.type,
            ruleSet: applicable.find((r) => r.type === byContent.best.type),
            score: byContent.best.score,
            ambiguous: false,
            via: 'content',
            scores: byContent.scores,
            reason: null
        };
    }

    // Pass 2: fall back to where the file is filed. Only reached when the
    // document itself said nothing, or said two things equally loudly.
    if (folderFallback && folderPath) {
        const byFolder = pass(true);
        if (byFolder.decided) {
            return {
                type: byFolder.best.type,
                ruleSet: applicable.find((r) => r.type === byFolder.best.type),
                score: byFolder.best.score,
                ambiguous: false,
                via: 'folder',
                scores: byFolder.scores,
                reason: null
            };
        }
    }

    if (byContent.tied.length > 1) {
        return {
            type: null,
            ruleSet: null,
            score: byContent.tied[0].score,
            ambiguous: true,
            via: null,
            scores: byContent.scores,
            reason: `Ambiguous classification, tied between: ${byContent.tied.map((t) => t.type).join(', ')}`
        };
    }

    return {
        type: null,
        ruleSet: null,
        score: 0,
        ambiguous: false,
        via: null,
        scores: byContent.scores,
        reason: 'No document type matched enough classification signals'
    };
}

module.exports = {
    classify,
    scoreRuleSet,
    FOLDER_HINT_WEIGHT,
    CONTENT_MATCH_WEIGHT,
    FILENAME_HINT_WEIGHT
};
