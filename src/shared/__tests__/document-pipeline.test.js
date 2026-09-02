/**
 * End-to-end pipeline test over real PDF files.
 *
 * Everything else in this feature's suites mocks pdf-parse. This one runs the
 * genuine parser against committed PDF fixtures, so a regression in text
 * extraction, classification, field extraction, or name rendering is caught
 * against real bytes rather than a stubbed string.
 *
 * Expected names follow the conventions in OutputBox/{CHECK,GLJE,WIRE}, which
 * is the authoritative post-rename form. The check and wire fixtures reproduce
 * genuine filenames observed there. COSTING is absent: OutputBox has no COSTING
 * folder and no convention exists for it.
 */

const fs = require('fs');
const path = require('path');

const { extractPdfText, MIN_TEXT_LAYER_CHARS } = require('../document-content-extractor');
const { classify } = require('../document-classifier');
const { buildProposedName, isCompliant, extractFields } = require('../document-naming-engine');
const { getRuleSet } = require('../document-type-rules');

const FIXTURES = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'documents');

/** Full pipeline over one fixture, as the worker runs it. */
async function runPipeline(fixture, fileName = 'scan_0417.pdf') {
    const buffer = fs.readFileSync(path.join(FIXTURES, `${fixture}.pdf`));
    const { text, pageCount } = await extractPdfText(buffer);
    const classification = classify({ fileName, text });
    const proposal = classification.ruleSet
        ? buildProposedName({ fileName, text, ruleSet: classification.ruleSet })
        : null;
    return { text, pageCount, classification, proposal };
}

describe('document pipeline over real PDFs', () => {
    const expected = {
        check: 'Check_38490_MICHAEL RADOCHAY_1_5_2026.pdf',
        wire: 'WIRE_251103B02FHR_$237,800.00.pdf'
    };

    describe.each(Object.keys(expected))('%s.pdf', (fixture) => {
        it('extracts a usable text layer', async () => {
            const { text, pageCount } = await runPipeline(fixture);
            expect(text.trim().length).toBeGreaterThanOrEqual(MIN_TEXT_LAYER_CHARS);
            expect(pageCount).toBeGreaterThan(0);
        });

        it('classifies to the expected document type', async () => {
            const { classification } = await runPipeline(fixture);
            expect(classification.type).toBe(fixture.toUpperCase());
            expect(classification.ambiguous).toBe(false);
        });

        it('renders the expected filename', async () => {
            const { proposal } = await runPipeline(fixture);
            expect(proposal.ok).toBe(true);
            expect(proposal.name).toBe(expected[fixture]);
        });

        it('renders a name its own convention accepts, so no rename loops', async () => {
            const { classification, proposal } = await runPipeline(fixture);
            expect(isCompliant(proposal.name, classification.ruleSet)).toBe(true);
        });

        it('is left alone once already correctly named', async () => {
            const { classification } = await runPipeline(fixture, expected[fixture]);
            expect(isCompliant(expected[fixture], getRuleSet(fixture.toUpperCase()))).toBe(true);
            expect(classification.type).toBe(fixture.toUpperCase());
        });
    });

    describe('glje.pdf', () => {
        it('classifies correctly', async () => {
            expect((await runPipeline('glje')).classification.type).toBe('GLJE');
        });

        it('extracts the G/L date, which survives OCR cleanly', async () => {
            const { classification, text } = await runPipeline('glje');
            expect(extractFields(text, classification.ruleSet).values.glDate).toBe('06_30_2026');
        });

        it('renders a compliant name', async () => {
            const { proposal, classification } = await runPipeline('glje');
            expect(proposal.ok).toBe(true);
            expect(proposal.name).toMatch(/^GLJE_06_30_2026_\d{6}\.pdf$/);
            expect(isCompliant(proposal.name, classification.ruleSet)).toBe(true);
        });

        it('mints a different id on every run, since the id is random', async () => {
            // The trailing 6 digits appear nowhere in the document; they are
            // generated. A dry run's proposed GLJE name therefore will NOT equal
            // the name a later live run produces -- check the shape, not the value.
            const names = new Set();
            for (let i = 0; i < 5; i += 1) {
                // eslint-disable-next-line no-await-in-loop -- sequential by design
                names.add((await runPipeline('glje')).proposal.name);
            }
            expect(names.size).toBeGreaterThan(1);
        });

        it('keeps the date stable even though the id varies', async () => {
            const a = await runPipeline('glje');
            const b = await runPipeline('glje');
            const datePart = (n) => n.split('_').slice(1, 4).join('_');
            expect(datePart(a.proposal.name)).toBe(datePart(b.proposal.name));
        });
    });

    describe('OCR corruption', () => {
        it('refuses a wire whose PAR number OCR mangled', () => {
            // 251103B02FHR reads as "251'103802FH   R" -- the B becomes an 8. The
            // validate regex requires a literal B in position 7, so this is refused
            // rather than renamed to a confidently wrong bank reference. The live
            // files WIRE_251125801YWH_... are that failure leaking through an
            // earlier attempt that had no such guard.
            const result = buildProposedName({
                fileName: 'x.pdf',
                text: "PAR Number 251'103802FH   R  Repeat Code Nickname\nAmount $237,800.00\n",
                ruleSet: getRuleSet('WIRE')
            });
            expect(result.ok).toBe(false);
        });

        it('still extracts the amount, which survives OCR cleanly', () => {
            const { values } = extractFields(
                "PAR Number 251'103802FH   R  Repeat Code\nAmount $237,800.00\n",
                getRuleSet('WIRE')
            );
            expect(values.amount).toBe('237,800.00');
        });
    });

    it('declines to classify a document with no financial content', async () => {
        const { classification, proposal } = await runPipeline('unrelated');
        expect(classification.type).toBeNull();
        expect(proposal).toBeNull();
    });

    it('ignores the incoming filename when content is decisive', async () => {
        // A wire misnamed as a check must still classify as a wire.
        expect((await runPipeline('wire', 'check_scan_0001.pdf')).classification.type).toBe('WIRE');
    });

    it('produces the same name regardless of the original filename', async () => {
        const a = await runPipeline('check', 'scan_0417.pdf');
        const b = await runPipeline('check', 'totally_different_name.pdf');
        expect(a.proposal.name).toBe(b.proposal.name);
    });
});
