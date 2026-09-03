const {
    isCompliant,
    hasSupportedExtension,
    extractFields,
    renderName,
    buildProposedName,
    sanitizeToken,
    getExtension,
    getStem,
    MAX_FILENAME_LENGTH
} = require('../document-naming-engine');
const { validateRuleSet } = require('../document-type-rules');

const GLJE = validateRuleSet({
    type: 'GLJE',
    classify: { filenameHints: ['glje'] },
    fields: {
        entity: { pattern: 'Entity:\\s*([A-Za-z0-9]+)', transform: ['upper', 'alnum'] },
        period: { pattern: 'Period:\\s*([0-9-]+)', transform: ['digits'] },
        jeNumber: { pattern: 'JE\\s*#\\s*([0-9]+)', transform: ['digits'] }
    },
    template: 'GLJE_{entity}_{period}_{jeNumber}',
    validate: '^GLJE_[A-Z0-9]+_\\d{6}_\\d+\\.pdf$'
}, 'test');

const TEXT = 'General Journal Entry\nEntity: FAM\nPeriod: 2026-08\nJE # 12345\n';

describe('document-naming-engine', () => {
    describe('getExtension', () => {
        it('returns the lowercased extension', () => {
            expect(getExtension('Report.PDF')).toBe('.pdf');
            expect(getExtension('a.b.c.pdf')).toBe('.pdf');
        });

        it('returns empty string when there is no extension', () => {
            expect(getExtension('README')).toBe('');
            expect(getExtension('trailing.')).toBe('');
            expect(getExtension('')).toBe('');
            expect(getExtension(null)).toBe('');
        });

        it('treats a leading dot as a hidden file, not an extension', () => {
            expect(getExtension('.gitignore')).toBe('');
        });
    });

    describe('getStem', () => {
        it('strips the extension', () => {
            expect(getStem('Invoice_2026.pdf')).toBe('Invoice_2026');
        });

        it('returns the whole name when there is no extension', () => {
            expect(getStem('README')).toBe('README');
        });
    });

    describe('sanitizeToken', () => {
        it('preserves the punctuation real payee names contain', () => {
            // The live convention keeps these, e.g.
            // "Check_38521_LA ANTENA PALLETS & LUMBER SALES INC_1_7_2026.pdf"
            expect(sanitizeToken('Acme Widgets, Inc.')).toBe('Acme Widgets, Inc');
            expect(sanitizeToken('LA ANTENA PALLETS & LUMBER SALES INC'))
                .toBe('LA ANTENA PALLETS & LUMBER SALES INC');
            expect(sanitizeToken("NACHO'S LOCK & KEY SERVICE")).toBe("NACHO'S LOCK & KEY SERVICE");
        });

        it('keeps underscores, which the date transforms legitimately emit', () => {
            expect(sanitizeToken('1_5_2026')).toBe('1_5_2026');
        });

        it('collapses the whitespace runs OCR text is full of', () => {
            expect(sanitizeToken('MICHAEL    RADOCHAY')).toBe('MICHAEL RADOCHAY');
        });

        it('neutralises path traversal', () => {
            expect(sanitizeToken('../../etc/passwd')).toBe('etcpasswd');
        });

        it('still strips every SharePoint-illegal character', () => {
            expect(sanitizeToken('a"b*c:d<e>f?g/h\\i|j')).toBe('abcdefghij');
        });

        it('collapses and trims hyphen runs left by stripping', () => {
            expect(sanitizeToken('ACME -- INC')).toBe('ACME - INC');
            expect(sanitizeToken('  -ACME-  ')).toBe('ACME');
        });

        it('returns empty string when nothing safe survives', () => {
            expect(sanitizeToken('///')).toBe('');
            expect(sanitizeToken(null)).toBe('');
        });
    });

    describe('isCompliant', () => {
        it('accepts a name matching the convention', () => {
            expect(isCompliant('GLJE_FAM_202608_12345.pdf', GLJE)).toBe(true);
        });

        it('rejects a name that does not', () => {
            expect(isCompliant('scan_0417.pdf', GLJE)).toBe(false);
            expect(isCompliant('GLJE_FAM_202608_12345.docx', GLJE)).toBe(false);
            expect(isCompliant('GLJE_fam_202608_12345.pdf', GLJE)).toBe(false);
        });

        it('handles missing inputs without throwing', () => {
            expect(isCompliant(null, GLJE)).toBe(false);
            expect(isCompliant('x.pdf', null)).toBe(false);
        });
    });

    describe('hasSupportedExtension', () => {
        it('accepts a declared extension and rejects others', () => {
            expect(hasSupportedExtension('a.pdf', GLJE)).toBe(true);
            expect(hasSupportedExtension('a.PDF', GLJE)).toBe(true);
            expect(hasSupportedExtension('a.xlsx', GLJE)).toBe(false);
            expect(hasSupportedExtension('noext', GLJE)).toBe(false);
        });
    });

    describe('extractFields', () => {
        it('extracts and transforms every declared field', () => {
            expect(extractFields(TEXT, GLJE)).toEqual({
                values: { entity: 'FAM', period: '202608', jeNumber: '12345' },
                missing: []
            });
        });

        it('reports every missing required field', () => {
            const result = extractFields('General Journal Entry\nEntity: FAM\n', GLJE);
            expect(result.missing).toEqual(['period', 'jeNumber']);
            expect(result.values.entity).toBe('FAM');
        });

        it('treats empty text as everything missing', () => {
            expect(extractFields('', GLJE).missing).toHaveLength(3);
            expect(extractFields(null, GLJE).missing).toHaveLength(3);
        });

        it('matches case-insensitively', () => {
            const result = extractFields('entity: fam\nperiod: 2026-08\nje # 12345', GLJE);
            expect(result.values.entity).toBe('FAM');
            expect(result.missing).toEqual([]);
        });

        it('counts a field that transforms to nothing as missing', () => {
            const ruleSet = validateRuleSet({
                type: 'X',
                classify: { filenameHints: ['x'] },
                fields: { when: { pattern: 'Date:\\s*(\\S+)', transform: ['date:YYYYMMDD'] } },
                template: 'X_{when}',
                validate: '^X_\\d{8}\\.pdf$'
            }, 'test');
            // Matches the pattern, but is not a real date.
            expect(extractFields('Date: 13/45/2026', ruleSet).missing).toEqual(['when']);
        });

        it('substitutes the default for an absent optional field', () => {
            const ruleSet = validateRuleSet({
                type: 'X',
                classify: { filenameHints: ['x'] },
                fields: {
                    rev: { pattern: 'Rev:\\s*(\\d+)', required: false, default: '0', transform: ['digits'] }
                },
                template: 'X_R{rev}',
                validate: '^X_R\\d+\\.pdf$'
            }, 'test');
            expect(extractFields('no revision here', ruleSet).values.rev).toBe('0');
        });

        it('truncates to maxLength', () => {
            const ruleSet = validateRuleSet({
                type: 'X',
                classify: { filenameHints: ['x'] },
                fields: { who: { pattern: 'Who:\\s*(.+)', transform: ['collapse'], maxLength: 6 } },
                template: 'X_{who}',
                validate: '^X_.+\\.pdf$'
            }, 'test');
            expect(extractFields('Who: AB CDEFGH', ruleSet).values.who).toBe('AB-CDE');
        });

        it('does not leave a trailing hyphen when truncation lands on one', () => {
            const ruleSet = validateRuleSet({
                type: 'X',
                classify: { filenameHints: ['x'] },
                fields: { who: { pattern: 'Who:\\s*(.+)', transform: ['collapse'], maxLength: 3 } },
                template: 'X_{who}',
                validate: '^X_.+\\.pdf$'
            }, 'test');
            expect(extractFields('Who: AB CDEFGH', ruleSet).values.who).toBe('AB');
        });

        it('sanitises a hostile value pulled from document content', () => {
            const ruleSet = validateRuleSet({
                type: 'X',
                classify: { filenameHints: ['x'] },
                fields: { who: { pattern: 'Who:\\s*(.+)', transform: ['trim'] } },
                template: 'X_{who}',
                validate: '^X_.+\\.pdf$'
            }, 'test');
            expect(extractFields('Who: ../../etc/passwd', ruleSet).values.who).toBe('etcpasswd');
        });
    });

    describe('renderName', () => {
        it('renders the template with the extension', () => {
            const result = renderName({ entity: 'FAM', period: '202608', jeNumber: '12345' }, GLJE, '.pdf');
            expect(result).toEqual({ ok: true, name: 'GLJE_FAM_202608_12345.pdf', reason: null });
        });

        it('fails when a placeholder has no value', () => {
            const result = renderName({ entity: 'FAM' }, GLJE, '.pdf');
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/unresolved: period, jeNumber/);
        });

        it('fails when the rendered name does not satisfy its own convention', () => {
            // period is not 6 digits, so validate cannot match. Catching this here
            // is what stops a rename producing a name the next sweep rejects.
            const result = renderName({ entity: 'FAM', period: '99', jeNumber: '1' }, GLJE, '.pdf');
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/does not satisfy the convention for GLJE/);
        });

        it('fails when the rendered name exceeds the length ceiling', () => {
            const ruleSet = validateRuleSet({
                type: 'X',
                classify: { filenameHints: ['x'] },
                fields: { who: { pattern: '(.+)' } },
                template: 'X_{who}',
                validate: '^X_.+\\.pdf$'
            }, 'test');
            const result = renderName({ who: 'A'.repeat(MAX_FILENAME_LENGTH) }, ruleSet, '.pdf');
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/over the 200 limit/);
        });
    });

    describe('buildProposedName', () => {
        it('produces a compliant name from document text', () => {
            const result = buildProposedName({ fileName: 'scan_0417.pdf', text: TEXT, ruleSet: GLJE });
            expect(result.ok).toBe(true);
            expect(result.name).toBe('GLJE_FAM_202608_12345.pdf');
        });

        it('round-trips: the proposed name is judged compliant', () => {
            // The property that prevents an infinite rename loop.
            const result = buildProposedName({ fileName: 'scan_0417.pdf', text: TEXT, ruleSet: GLJE });
            expect(isCompliant(result.name, GLJE)).toBe(true);
        });

        it('preserves the original extension', () => {
            const result = buildProposedName({ fileName: 'SCAN.PDF', text: TEXT, ruleSet: GLJE });
            expect(result.name.endsWith('.pdf')).toBe(true);
        });

        it('reports which required fields could not be extracted', () => {
            const result = buildProposedName({ fileName: 'x.pdf', text: 'Entity: FAM', ruleSet: GLJE });
            expect(result.ok).toBe(false);
            expect(result.missing).toEqual(['period', 'jeNumber']);
            expect(result.reason).toMatch(/Could not extract required field\(s\): period, jeNumber/);
        });
    });
});
