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
    const { extractFields, buildProposedName } = require('../document-naming-engine');
    const { getRuleSet } = require('../document-type-rules');

    // Wires whose fixture includes the SinglePoint transaction-detail page.
    // That page is NOT page 1, and it carries both the PAR Number and a clean
    // unformatted WIRE AMOUNT. pdf-parse reads every page in production; the
    // page-1-only fixtures below cannot show what is really extractable.
    const WITH_DETAIL_PAGE = {
        WIRE_INTAKE_TTG: 'WIRE_260203B01PR1_$18,593.28.pdf',
        WIRE_INTAKE_SINGAPORE: 'WIRE_260226B01WYD_$322,436.88.pdf'
    };

    it.each(Object.entries(WITH_DETAIL_PAGE))('renames %s from its detail page', (key, expected) => {
        const result = buildProposedName({
            fileName: 'whatever.pdf',
            text: samples[key].text,
            ruleSet: getRuleSet('WIRE')
        });
        expect({ key, name: result.name }).toEqual({ key, name: expected });
    });

    it('reads the PAR reference from SENDERS REFERENCE, not the PAR NUMBER line', () => {
        // Both carry the same value, but OCR corrupts the PAR NUMBER line and
        // leaves SENDERS REFERENCE clean:
        //   PAR NUMBER:        260226801WYD   <- B read as 8
        //   SENDERS REFERENCE: 260226B01WYD   <- intact
        // Matching the corrupted one would flag a file that is readable.
        expect(samples.WIRE_INTAKE_SINGAPORE.text).toMatch(/PAR NUMBER:\s*260226801WYD/);
        const { values } = extractFields(samples.WIRE_INTAKE_SINGAPORE.text, getRuleSet('WIRE'));
        expect(values.parNumber).toBe('260226B01WYD');
    });

    it('recovers an amount page 1 had destroyed', () => {
        // Page 1 renders this as "$322,436   88" -- the decimal point read as
        // whitespace, unrecoverable. The detail page has "WIRE AMOUNT:322436.88".
        expect(samples.WIRE_INTAKE_SINGAPORE.text).toMatch(/\$322,436\s{2,}88/);
        const { values } = extractFields(samples.WIRE_INTAKE_SINGAPORE.text, getRuleSet('WIRE'));
        expect(values.amount).toBe('322,436.88');
    });

    it('flags a Fed wire, which has no transaction-detail page at all', () => {
        // Read pages 1-4 of this document: the later pages are the vendor's own
        // invoices. Fed wires carry no PAR Number, so they cannot satisfy the
        // convention and correctly land on the exception path.
        const { missing } = extractFields(samples.WIRE_INTAKE_BELLDINI.text, getRuleSet('WIRE'));
        expect(missing).toContain('parNumber');
    });

    it('formats a plain figure into the grouping the convention needs', () => {
        const { applyTransform } = require('../document-field-transforms');
        expect(applyTransform('thousands', '18593.28')).toBe('18,593.28');
        expect(applyTransform('thousands', '1000000.00')).toBe('1,000,000.00');
        // Refuses anything that is not a well-formed figure.
        expect(applyTransform('thousands', '18,93')).toBe('');
    });

    it('leaves page-1-only fixtures documented as incomplete', () => {
        // Guard against someone reading a failure on these as proof the real
        // file cannot be renamed. They simply lack the detail page.
        const pageOneOnly = Object.keys(samples)
            .filter((k) => k.startsWith('WIRE_INTAKE_'))
            .filter((k) => samples[k].coverage === 'page 1 only');
        expect(pageOneOnly).toEqual([
            'WIRE_INTAKE_CROWN',
            'WIRE_INTAKE_COMPASS',
            'WIRE_INTAKE_NINGBO',
            'WIRE_INTAKE_JUNGKWANG'
        ]);
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
