/**
 * Classification accuracy against real OCR text.
 *
 * The fixtures in test/fixtures/ocr-samples.js are verbatim output from Graph's
 * text extraction over actual documents in this SharePoint site, corruption and
 * all. This suite exists to answer one question with a number rather than an
 * opinion: can a document's type be identified from its own content, without
 * relying on which folder it was filed in?
 *
 * It is a regression guard. If someone weakens a content pattern, the count
 * drops here and the build fails, rather than the sweep quietly falling back to
 * folder guesses in production.
 */

const samples = require('../../../test/fixtures/ocr-samples');
const { classify } = require('../document-classifier');
const { loadRuleSets, resetRuleSetCache } = require('../document-type-rules');

// COSTING ships disabled, so include disabled sets to measure all four types.
let ALL_RULE_SETS;

beforeAll(() => {
    resetRuleSetCache();
    ALL_RULE_SETS = loadRuleSets({ includeDisabled: true });
});

/** Classify from content and filename only. */
function byContentAlone(text) {
    return classify({
        fileName: 'scan_0417.pdf',
        text,
        folderFallback: false,
        ruleSets: ALL_RULE_SETS
    });
}

describe('classification from content alone', () => {
    const cases = Object.entries(samples);

    it.each(cases)('identifies %s', (name, sample) => {
        const result = byContentAlone(sample.text);
        expect({ name, type: result.type }).toEqual({ name, type: sample.expected });
    });

    it('identifies every real document, and declines the unrelated one', () => {
        const correct = cases.filter(([, s]) => byContentAlone(s.text).type === s.expected);
        expect(correct).toHaveLength(cases.length);
    });

    it('reports content as the deciding signal', () => {
        for (const [, sample] of cases.filter(([, s]) => s.expected !== null)) {
            expect(byContentAlone(sample.text).via).toBe('content');
        }
    });

    it('does not let the wire statement\'s "Commercial Internet Banking" read as a costing invoice', () => {
        // A live false-positive risk: the COSTING pattern is anchored on
        // "Commercial Invoice", and the U.S. Bank wire page says
        // "Commercial lnternet Banking".
        expect(byContentAlone(samples.WIRE.text).type).toBe('WIRE');
    });

    it('identifies the worst-OCR costing invoice, which carries no clean label', () => {
        // IDEAL has no readable "INVOICE NO" or "Commercial Invoice"; it is
        // caught by the OCR-tolerant import-invoice markers instead.
        expect(byContentAlone(samples.COSTING_IDEAL.text).type).toBe('COSTING');
    });
});

describe('content outranks the folder', () => {
    /** Classify with the file deliberately filed under the wrong type. */
    function misfiled(text, folderPath) {
        return classify({ fileName: 'scan_0417.pdf', text, folderPath, ruleSets: ALL_RULE_SETS });
    }

    it('classifies a misfiled document by what it actually is', () => {
        // Every real sample, told it lives in the wires folder.
        for (const [name, sample] of Object.entries(samples)) {
            if (sample.expected === null) {
                continue;
            }
            const result = misfiled(sample.text, 'Intake_Wires/2026_02');
            expect({ name, type: result.type, via: result.via })
                .toEqual({ name, type: sample.expected, via: 'content' });
        }
    });

    it('ignores a misleading filename too', () => {
        const result = classify({
            fileName: 'check_scan_0001.pdf',
            text: samples.WIRE.text,
            folderPath: 'Intake_Checks/2026/2026_01',
            ruleSets: ALL_RULE_SETS
        });
        expect(result.type).toBe('WIRE');
        expect(result.via).toBe('content');
    });
});

describe('the folder as a fallback', () => {
    const ILLEGIBLE = 'illegible scan output carrying no recognisable markers at all here';

    it('is not consulted while content is conclusive', () => {
        expect(classify({
            fileName: 's.pdf',
            text: samples.CHECK.text,
            folderPath: 'Intake_Wires/2026_02',
            ruleSets: ALL_RULE_SETS
        }).via).toBe('content');
    });

    it('rescues a document whose OCR yielded nothing', () => {
        const result = classify({
            fileName: 's.pdf',
            text: ILLEGIBLE,
            folderPath: 'Intake_Wires/2026_02',
            ruleSets: ALL_RULE_SETS
        });
        expect(result).toMatchObject({ type: 'WIRE', via: 'folder' });
    });

    it('declines when there is no folder to fall back on', () => {
        expect(classify({ fileName: 's.pdf', text: ILLEGIBLE, ruleSets: ALL_RULE_SETS }).type)
            .toBeNull();
    });

    it('can be switched off for pure content classification', () => {
        expect(classify({
            fileName: 's.pdf',
            text: ILLEGIBLE,
            folderPath: 'Intake_Wires/2026_02',
            folderFallback: false,
            ruleSets: ALL_RULE_SETS
        }).type).toBeNull();
    });

    it('types an unrelated document from its folder, which is the cost of the fallback', () => {
        // Honest about the tradeoff: meeting notes filed under Intake_Wires are
        // typed WIRE, then fail field extraction and land on the exception path
        // as MissingFields rather than the more accurate Unclassified. It never
        // produces a wrong rename, only a less precise status. Recall on badly
        // OCR'd real documents is worth more than precision on stray files.
        const result = classify({
            fileName: 's.pdf',
            text: samples.UNRELATED.text,
            folderPath: 'Intake_Wires/2026_02',
            ruleSets: ALL_RULE_SETS
        });
        expect(result).toMatchObject({ type: 'WIRE', via: 'folder' });

        // Switching the fallback off restores the precise answer.
        expect(classify({
            fileName: 's.pdf',
            text: samples.UNRELATED.text,
            folderPath: 'Intake_Wires/2026_02',
            folderFallback: false,
            ruleSets: ALL_RULE_SETS
        }).type).toBeNull();
    });
});
