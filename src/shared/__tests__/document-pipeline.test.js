/**
 * End-to-end pipeline test over real PDF files.
 *
 * Everything else in this feature's suites mocks pdf-parse. This one runs the
 * genuine parser against committed PDF fixtures, so a regression in text
 * extraction, classification, field extraction, or name rendering is caught
 * against real bytes rather than a stubbed string.
 *
 * The fixtures are plain text-layer PDFs, deliberately not scans: the scanned
 * path has no text to extract and is covered by the extractor's own suite.
 */

const fs = require('fs');
const path = require('path');

const { extractPdfText, MIN_TEXT_LAYER_CHARS } = require('../document-content-extractor');
const { classify } = require('../document-classifier');
const { buildProposedName, isCompliant } = require('../document-naming-engine');
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
        glje: 'GLJE_FAM_202608_12345.pdf',
        check: 'CHECK_ACMEWIDGETSINC_000123_20260819.pdf',
        costing: 'COSTING_ABC1234_SPRING2026_R2.pdf',
        wire: 'WIRE_GLOBALTEXTILESLTD_4500000_20260820.pdf'
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
            // The second sweep must treat the renamed file as finished.
            const { classification } = await runPipeline(fixture, expected[fixture]);
            expect(isCompliant(expected[fixture], getRuleSet(fixture.toUpperCase()))).toBe(true);
            expect(classification.type).toBe(fixture.toUpperCase());
        });
    });

    it('declines to classify a document with no financial content', async () => {
        const { classification, proposal } = await runPipeline('unrelated');
        expect(classification.type).toBeNull();
        expect(proposal).toBeNull();
    });

    it('ignores the incoming filename when content is decisive', async () => {
        // A wire misnamed as a check must still classify as a wire.
        const { classification } = await runPipeline('wire', 'check_scan_0001.pdf');
        expect(classification.type).toBe('WIRE');
    });

    it('produces the same name regardless of the original filename', async () => {
        const a = await runPipeline('glje', 'scan_0417.pdf');
        const b = await runPipeline('glje', 'totally_different_name.pdf');
        expect(a.proposal.name).toBe(b.proposal.name);
    });
});
