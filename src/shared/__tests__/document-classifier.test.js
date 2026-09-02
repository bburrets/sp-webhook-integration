const { classify, scoreRuleSet } = require('../document-classifier');
const { validateRuleSet } = require('../document-type-rules');

const CHECK = validateRuleSet({
    type: 'CHECK',
    classify: {
        filenameHints: ['check', 'chk'],
        contentPatterns: ['Pay\\s+to\\s+the\\s+order\\s+of', 'Check\\s*No'],
        minMatches: 1
    },
    fields: { n: { pattern: 'Check\\s*No:?\\s*(\\d+)' } },
    template: 'CHECK_{n}',
    validate: '^CHECK_\\d+\\.pdf$'
}, 'test');

const WIRE = validateRuleSet({
    type: 'WIRE',
    classify: {
        filenameHints: ['wire'],
        contentPatterns: ['Wire\\s+Transfer', 'Beneficiary'],
        minMatches: 1
    },
    fields: { n: { pattern: 'Ref:?\\s*(\\d+)' } },
    template: 'WIRE_{n}',
    validate: '^WIRE_\\d+\\.pdf$'
}, 'test');

const STRICT = validateRuleSet({
    type: 'STRICT',
    classify: {
        filenameHints: ['strict'],
        contentPatterns: ['Alpha', 'Beta'],
        minMatches: 3
    },
    fields: { n: { pattern: '(\\d+)' } },
    template: 'STRICT_{n}',
    validate: '^STRICT_\\d+\\.pdf$'
}, 'test');

const XLSX_ONLY = validateRuleSet({
    type: 'SHEET',
    extensions: ['.xlsx'],
    classify: { filenameHints: ['sheet'] },
    fields: { n: { pattern: '(\\d+)' } },
    template: 'SHEET_{n}',
    validate: '^SHEET_\\d+\\.xlsx$'
}, 'test');

const RULE_SETS = [CHECK, WIRE];

describe('document-classifier', () => {
    describe('scoreRuleSet', () => {
        it('weights a content match above a filename hint', () => {
            const byContent = scoreRuleSet({ fileName: 'x.pdf', text: 'Wire Transfer', ruleSet: WIRE });
            const byName = scoreRuleSet({ fileName: 'wire.pdf', text: '', ruleSet: WIRE });
            expect(byContent.score).toBeGreaterThan(byName.score);
        });

        it('counts multiple filename hints as a single signal', () => {
            // Both 'check' and 'chk' appear; confidence must not double.
            const scored = scoreRuleSet({ fileName: 'check_chk.pdf', text: '', ruleSet: CHECK });
            expect(scored.signals).toBe(1);
            expect(scored.filenameHit).toBe(true);
        });

        it('counts each matching content pattern separately', () => {
            const scored = scoreRuleSet({
                fileName: 'x.pdf',
                text: 'Pay to the order of: Acme\nCheck No: 1',
                ruleSet: CHECK
            });
            expect(scored.contentMatches).toBe(2);
        });

        it('respects minMatches when deciding eligibility', () => {
            expect(scoreRuleSet({ fileName: 'strict.pdf', text: 'Alpha', ruleSet: STRICT }).eligible).toBe(false);
            expect(scoreRuleSet({ fileName: 'strict.pdf', text: 'Alpha Beta', ruleSet: STRICT }).eligible).toBe(true);
        });

        it('ignores the extension when matching filename hints', () => {
            expect(scoreRuleSet({ fileName: 'wire.pdf', text: '', ruleSet: WIRE }).filenameHit).toBe(true);
        });
    });

    describe('classify', () => {
        it('classifies from content alone', () => {
            const result = classify({ fileName: 'scan_0417.pdf', text: 'Wire Transfer Advice', ruleSets: RULE_SETS });
            expect(result.type).toBe('WIRE');
            expect(result.ambiguous).toBe(false);
        });

        it('classifies from the filename alone when there is no text', () => {
            const result = classify({ fileName: 'check_scan.pdf', text: '', ruleSets: RULE_SETS });
            expect(result.type).toBe('CHECK');
        });

        it('lets content override a misleading filename', () => {
            // The core reason content outweighs filenames: the names in this
            // folder are wrong, which is why the feature exists.
            const result = classify({
                fileName: 'check_scan.pdf',
                text: 'Wire Transfer Advice\nBeneficiary Name: Acme',
                ruleSets: RULE_SETS
            });
            expect(result.type).toBe('WIRE');
        });

        it('returns null when nothing matches enough signals', () => {
            const result = classify({ fileName: 'random.pdf', text: 'lorem ipsum', ruleSets: RULE_SETS });
            expect(result.type).toBeNull();
            expect(result.ruleSet).toBeNull();
            expect(result.reason).toMatch(/did not match|No document type matched/i);
        });

        it('returns null and flags ambiguity on a tie rather than guessing', () => {
            const result = classify({
                fileName: 'x.pdf',
                text: 'Check No: 1\nWire Transfer',
                ruleSets: RULE_SETS
            });
            expect(result.type).toBeNull();
            expect(result.ambiguous).toBe(true);
            expect(result.reason).toMatch(/Ambiguous.*CHECK, WIRE|Ambiguous.*WIRE, CHECK/);
        });

        it('breaks a near-tie in favour of more content evidence', () => {
            const result = classify({
                fileName: 'check.pdf',
                text: 'Wire Transfer\nBeneficiary Name: Acme',
                ruleSets: RULE_SETS
            });
            expect(result.type).toBe('WIRE');
        });

        it('excludes rule sets that do not accept the extension', () => {
            const result = classify({ fileName: 'sheet.pdf', text: '', ruleSets: [XLSX_ONLY] });
            expect(result.type).toBeNull();
            expect(result.reason).toMatch(/No document type accepts the extension "\.pdf"/);
        });

        it('reports a file with no extension', () => {
            const result = classify({ fileName: 'noextension', text: 'Wire Transfer', ruleSets: RULE_SETS });
            expect(result.type).toBeNull();
            expect(result.reason).toMatch(/no extension/);
        });

        it('handles missing text and missing filename without throwing', () => {
            expect(classify({ fileName: 'x.pdf', text: null, ruleSets: RULE_SETS }).type).toBeNull();
            expect(classify({ ruleSets: RULE_SETS }).type).toBeNull();
            expect(classify({}).type).toBeNull();
        });

        it('returns the matching rule set object alongside the type', () => {
            const result = classify({ fileName: 'x.pdf', text: 'Wire Transfer', ruleSets: RULE_SETS });
            expect(result.ruleSet).toBe(WIRE);
        });

        it('exposes per-type scores for diagnostics, highest first', () => {
            const result = classify({ fileName: 'x.pdf', text: 'Wire Transfer', ruleSets: RULE_SETS });
            expect(result.scores.map((s) => s.type)).toEqual(['WIRE', 'CHECK']);
        });
    });

    describe('folder hints', () => {
        const FOLDERED = validateRuleSet({
            type: 'CHECK',
            classify: { folderHints: ['check'], filenameHints: ['chk'], contentPatterns: ['Check\\s*No'] },
            fields: { n: { pattern: '(\\d+)' } },
            template: 'CHECK_{n}',
            validate: '^CHECK_\\d+\\.pdf$'
        }, 'test');

        it('classifies from the folder with no other signal', () => {
            const result = classify({
                fileName: 'scan.pdf', text: '', folderPath: 'CHECK/2026/2026_01', ruleSets: [FOLDERED]
            });
            expect(result.type).toBe('CHECK');
        });

        it('outweighs both content and filename', () => {
            const byFolder = scoreRuleSet({
                fileName: 'x.pdf', text: '', folderPath: 'CHECK', ruleSet: FOLDERED
            });
            const byContentAndName = scoreRuleSet({
                fileName: 'chk.pdf', text: 'Check No: 1', folderPath: '', ruleSet: FOLDERED
            });
            expect(byFolder.score).toBeGreaterThanOrEqual(byContentAndName.score);
            expect(byFolder.folderHit).toBe(true);
        });

        it('matches whole segments only', () => {
            // A folder called CHECKLIST is not the CHECK folder.
            expect(scoreRuleSet({
                fileName: 'x.pdf', text: '', folderPath: 'CHECKLIST/2026', ruleSet: FOLDERED
            }).folderHit).toBe(false);
        });

        it('matches at any depth', () => {
            expect(scoreRuleSet({
                fileName: 'x.pdf', text: '', folderPath: 'Archive/CHECK/2026', ruleSet: FOLDERED
            }).folderHit).toBe(true);
        });

        it('is case-insensitive', () => {
            expect(scoreRuleSet({
                fileName: 'x.pdf', text: '', folderPath: 'check/2026', ruleSet: FOLDERED
            }).folderHit).toBe(true);
        });

        it('counts multiple folder hints as one signal', () => {
            const multi = validateRuleSet({
                type: 'GLJE',
                classify: { folderHints: ['glje', 'gl-je'] },
                fields: { n: { pattern: '(\\d+)' } },
                template: 'GLJE_{n}',
                validate: '^GLJE_\\d+\\.pdf$'
            }, 'test');
            expect(scoreRuleSet({
                fileName: 'x.pdf', text: '', folderPath: 'glje/gl-je', ruleSet: multi
            }).signals).toBe(1);
        });

        it('is absent when no folder is supplied', () => {
            expect(scoreRuleSet({ fileName: 'x.pdf', text: '', ruleSet: FOLDERED }).folderHit).toBe(false);
        });
    });

    describe('against the rule sets shipped in this repo', () => {
        it('classifies each type from its output folder alone', () => {
            // How the sweep will actually work: OutputBox is organised by type.
            expect(classify({ fileName: 's.pdf', text: '', folderPath: 'CHECK/2026/2026_01' }).type).toBe('CHECK');
            expect(classify({ fileName: 's.pdf', text: '', folderPath: 'GLJE/2025_11' }).type).toBe('GLJE');
            expect(classify({ fileName: 's.pdf', text: '', folderPath: 'WIRE/2025_11' }).type).toBe('WIRE');
        });

        it('classifies each document type from representative text', () => {
            // Texts mirror what the real OCR'd documents contain.
            // COSTING is omitted: it is disabled pending a defined convention.
            const samples = {
                GLJE: 'General Journal FAM, LLC\nG/L Date: 6/30/2026',
                CHECK: 'Check: 0000038490\nMICHAEL RADOCHAY Check Total 5,000.00',
                WIRE: 'Wire Transfer Advice\nBeneficiary Name: Acme'
            };
            for (const [type, text] of Object.entries(samples)) {
                expect(classify({ fileName: 'scan_0417.pdf', text }).type).toBe(type);
            }
        });

        it('declines to classify unrelated content', () => {
            const result = classify({
                fileName: 'notes.pdf',
                text: 'Meeting notes from the quarterly planning session'
            });
            expect(result.type).toBeNull();
        });
    });
});
