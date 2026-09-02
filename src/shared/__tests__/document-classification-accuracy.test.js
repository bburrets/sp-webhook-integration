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

describe('field recovery from corrupted OCR', () => {
    const { extractFields } = require('../document-naming-engine');
    const { getRuleSet } = require('../document-type-rules');

    // Truth values taken from the filenames these documents already carry.
    const AMOUNTS = {
        WIRE: '237,800.00',
        WIRE_INTAKE_CROWN: '1,375,110.00',
        WIRE_INTAKE_COMPASS: '963,164.00'
    };

    it.each(Object.entries(AMOUNTS))('recovers the amount from %s', (key, expected) => {
        // OCR injects spaces and apostrophes into figures: "$1 ,375,'1   1   0.00"
        // and "$963,1   64.00". The numeric transform strips that noise without
        // touching a digit.
        const { values } = extractFields(samples[key].text, getRuleSet('WIRE'));
        expect({ key, amount: values.amount }).toEqual({ key, amount: expected });
    });

    it('refuses an amount with a substituted digit rather than guessing', () => {
        // "$18,s93.28" is 18,593.28 with the 5 read as an s. The 5 is simply
        // gone, so the capture yields "18", which fails the thousands-grouping
        // check in the validate regex. A wrong figure in a filename would be
        // worse than an exception.
        const { values, missing } = extractFields(samples.WIRE_INTAKE_TTG.text, getRuleSet('WIRE'));
        const money = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
        expect(missing.includes('amount') || !money.test(values.amount || '')).toBe(true);
    });

    /** Every 2026 intake wire sampled from Intake_Wires/2026_02. */
    const INTAKE_WIRES = Object.keys(samples).filter((k) => k.startsWith('WIRE_INTAKE_'));

    it('sampled seven real 2026 wires', () => {
        expect(INTAKE_WIRES).toHaveLength(7);
    });

    it('finds no PAR number in any of them', () => {
        // The blocker. OutputBox names wires by PAR Number, but not one 2026
        // document carries that field. Pinned so that if the PAR Number pattern
        // is later relaxed to match something else, this fails loudly.
        for (const key of INTAKE_WIRES) {
            const { missing } = extractFields(samples[key].text, getRuleSet('WIRE'));
            expect({ key, missing }).toEqual({ key, missing: expect.arrayContaining(['parNumber']) });
        }
    });

    it('confirms all of them carry a Control Number instead', () => {
        for (const key of INTAKE_WIRES) {
            expect({ key, hasControlNumber: /Control\s+Number/i.test(samples[key].text) })
                .toEqual({ key, hasControlNumber: true });
        }
    });

    it('recovers a control number split by injected whitespace', () => {
        // "1637   12156" and "1   63713348" are single numbers OCR broke apart.
        const pattern = /Control\s+Number\s+([0-9][0-9'\t ]{0,20}[0-9])/;
        const digits = (key) => (samples[key].text.match(pattern) || [])[1]
            ?.replace(/[^0-9]+/g, '');
        expect(digits('WIRE_INTAKE_NINGBO')).toBe('163712156');
        expect(digits('WIRE_INTAKE_JUNGKWANG')).toBe('163713348');
    });

    it('loses a digit when a control number has a substituted character', () => {
        // "164't00504" is 164100504 with the 1 read as 't. Stripping noise
        // yields 164, which a 9-digit length check refuses -- the reason a
        // Control-Number convention would still flag this file rather than
        // renaming it wrongly.
        const pattern = /Control\s+Number\s+([0-9][0-9'\t ]{0,20}[0-9])/;
        const captured = (samples.WIRE_INTAKE_BELLDINI.text.match(pattern) || [])[1];
        expect(String(captured).replace(/[^0-9]+/g, '')).not.toHaveLength(9);
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
