const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    loadRuleSets,
    getRuleSets,
    getRuleSet,
    validateRuleSet,
    templatePlaceholders,
    hasPlaceholderRules,
    placeholderTypes,
    hasGeneratedFields,
    resetRuleSetCache
} = require('../document-type-rules');

/** A rule object that passes validation, for tests to mutate. */
function validRaw(overrides = {}) {
    return {
        type: 'GLJE',
        classify: { filenameHints: ['glje'], contentPatterns: ['Journal\\s+Entry'], minMatches: 1 },
        fields: {
            entity: { pattern: 'Entity:\\s*(\\S+)', required: true, transform: ['upper'] }
        },
        template: 'GLJE_{entity}',
        validate: '^GLJE_[A-Z]+\\.pdf$',
        ...overrides
    };
}

/** Write rule files into a fresh temp directory. */
function writeRulesDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctype-rules-'));
    for (const [name, contents] of Object.entries(files)) {
        fs.writeFileSync(
            path.join(dir, name),
            typeof contents === 'string' ? contents : JSON.stringify(contents)
        );
    }
    return dir;
}

describe('document-type-rules', () => {
    afterEach(() => {
        resetRuleSetCache();
    });

    describe('templatePlaceholders', () => {
        it('extracts placeholder names', () => {
            expect(templatePlaceholders('GLJE_{entity}_{period}')).toEqual(['entity', 'period']);
        });

        it('returns an empty array when there are none', () => {
            expect(templatePlaceholders('STATIC')).toEqual([]);
        });

        it('is not affected by a previous call (no lastIndex leak)', () => {
            templatePlaceholders('A_{x}_{y}');
            expect(templatePlaceholders('A_{x}_{y}')).toEqual(['x', 'y']);
        });
    });

    describe('validateRuleSet rejects', () => {
        const cases = {
            'a template placeholder no field supplies': [
                { template: 'GLJE_{entity}_{nope}' }, /references \{nope\}/
            ],
            'a declared field the template never uses': [
                { fields: { entity: { pattern: '(a)' }, orphan: { pattern: '(b)' } } }, /"orphan" is declared but never used/
            ],
            'a field pattern that does not compile': [
                { fields: { entity: { pattern: '(unclosed' } } }, /not a valid regex/
            ],
            'a field pattern with no capture group': [
                { fields: { entity: { pattern: 'literal' } } }, /must contain a capture group/
            ],
            'an unknown transform': [
                { fields: { entity: { pattern: '(a)', transform: ['explode'] } } }, /unknown transform "explode"/
            ],
            'a transform that is not an array': [
                { fields: { entity: { pattern: '(a)', transform: 'upper' } } }, /transform must be an array/
            ],
            'a lowercase type': [{ type: 'glje' }, /must be uppercase/],
            'a missing type': [{ type: '' }, /type must be a non-empty string/],
            'an optional field with no default': [
                { fields: { entity: { pattern: '(a)', required: false } } }, /must declare a "default"/
            ],
            'a validate regex that does not compile': [{ validate: '^GLJE[' }, /validate is not a valid regex/],
            'a classify block with no signals': [
                { classify: { filenameHints: [], contentPatterns: [] } }, /at least one filenameHint or contentPattern/
            ],
            'a content pattern that does not compile': [
                { classify: { filenameHints: ['x'], contentPatterns: ['(bad'] } }, /contentPatterns\[0\] is not a valid regex/
            ],
            'a non-positive minMatches': [
                { classify: { filenameHints: ['x'], minMatches: 0 } }, /minMatches must be a positive integer/
            ],
            'a negative maxLength': [
                { fields: { entity: { pattern: '(a)', maxLength: -1 } } }, /maxLength must be a positive integer/
            ],
            'an extension without a leading dot': [{ extensions: ['pdf'] }, /starting with "\."/],
            'an empty extensions array': [{ extensions: [] }, /non-empty array/],
            'an empty fields object': [
                { fields: {}, template: 'GLJE_STATIC{x}' }, /at least one field/
            ]
        };

        Object.entries(cases).forEach(([label, [overrides, expected]]) => {
            it(label, () => {
                expect(() => validateRuleSet(validRaw(overrides), 'test.json')).toThrow(expected);
            });
        });

        it('a root that is not an object', () => {
            expect(() => validateRuleSet([], 'test.json')).toThrow(/root must be an object/);
            expect(() => validateRuleSet(null, 'test.json')).toThrow(/root must be an object/);
        });

        it('and reports every problem at once', () => {
            let message = '';
            try {
                validateRuleSet(validRaw({ type: 'glje', validate: '^[' }), 'test.json');
            } catch (error) {
                message = error.message;
            }
            expect(message).toMatch(/must be uppercase/);
            expect(message).toMatch(/validate is not a valid regex/);
        });
    });

    describe('generated fields', () => {
        function generatedRaw(fieldOverrides = {}) {
            return validRaw({
                fields: { seq: { generate: 'digits', length: 6, ...fieldOverrides } },
                template: 'GLJE_{seq}',
                validate: '^GLJE_\\d{6}\\.pdf$'
            });
        }

        it('accepts a well-formed generated field', () => {
            const ruleSet = validateRuleSet(generatedRaw(), 'test.json');
            expect(ruleSet.fields.seq.generate).toBe('digits');
            expect(ruleSet.fields.seq.length).toBe(6);
            expect(ruleSet.fields.seq.regex).toBeNull();
        });

        it('rejects an unknown generator', () => {
            expect(() => validateRuleSet(generatedRaw({ generate: 'dice' }), 'test.json'))
                .toThrow(/not a known generator/);
        });

        it('rejects a missing or invalid length', () => {
            expect(() => validateRuleSet(generatedRaw({ length: undefined }), 'test.json'))
                .toThrow(/length must be a positive integer/);
            expect(() => validateRuleSet(generatedRaw({ length: 0 }), 'test.json'))
                .toThrow(/length must be a positive integer/);
        });

        it('rejects a field that is both extracted and generated', () => {
            expect(() => validateRuleSet(generatedRaw({ pattern: '(\\d+)' }), 'test.json'))
                .toThrow(/cannot declare both "pattern" and "generate"/);
        });

        it('rejects an optional generated field', () => {
            // A minted value is always producible, so optional is meaningless.
            expect(() => validateRuleSet(generatedRaw({ required: false }), 'test.json'))
                .toThrow(/generated, so it cannot be optional/);
        });

        it('reports which rule sets mint values', () => {
            expect(hasGeneratedFields(validateRuleSet(generatedRaw(), 'test.json'))).toBe(true);
            expect(hasGeneratedFields(validateRuleSet(validRaw(), 'test.json'))).toBe(false);
            expect(hasGeneratedFields(null)).toBe(false);
        });

        it('is true for the shipped GLJE rules and false for CHECK', () => {
            expect(hasGeneratedFields(getRuleSet('GLJE'))).toBe(true);
            expect(hasGeneratedFields(getRuleSet('CHECK'))).toBe(false);
        });
    });

    describe('validateRuleSet accepts', () => {
        it('a well-formed rule set and normalises defaults', () => {
            const ruleSet = validateRuleSet(validRaw(), 'test.json');
            expect(ruleSet.type).toBe('GLJE');
            expect(ruleSet.enabled).toBe(true);
            expect(ruleSet.placeholder).toBe(false);
            expect(ruleSet.extensions).toEqual(['.pdf']);
            expect(ruleSet.fields.entity.required).toBe(true);
            expect(ruleSet.validateRegex.test('GLJE_FAM.pdf')).toBe(true);
        });

        it('an optional field that declares a default', () => {
            const ruleSet = validateRuleSet(validRaw({
                fields: { entity: { pattern: '(a)', required: false, default: 'NONE' } }
            }), 'test.json');
            expect(ruleSet.fields.entity.required).toBe(false);
            expect(ruleSet.fields.entity.default).toBe('NONE');
        });

        it('and lowercases extensions', () => {
            const ruleSet = validateRuleSet(validRaw({ extensions: ['.PDF'] }), 'test.json');
            expect(ruleSet.extensions).toEqual(['.pdf']);
        });

        it('and compiles field patterns case-insensitively', () => {
            const ruleSet = validateRuleSet(validRaw(), 'test.json');
            expect('entity: fam'.match(ruleSet.fields.entity.regex)[1]).toBe('fam');
        });
    });

    describe('loadRuleSets', () => {
        it('loads every json file in the directory', () => {
            const dir = writeRulesDir({
                'glje.json': validRaw(),
                'wire.json': validRaw({
                    type: 'WIRE',
                    classify: { filenameHints: ['wire'] },
                    template: 'WIRE_{entity}',
                    validate: '^WIRE_'
                })
            });
            expect(loadRuleSets({ dir }).map((r) => r.type).sort()).toEqual(['GLJE', 'WIRE']);
        });

        it('omits disabled rule sets', () => {
            const dir = writeRulesDir({
                'glje.json': validRaw(),
                'wire.json': validRaw({
                    type: 'WIRE', enabled: false, template: 'WIRE_{entity}', validate: '^WIRE_'
                })
            });
            expect(loadRuleSets({ dir }).map((r) => r.type)).toEqual(['GLJE']);
        });

        it('throws when every rule set is disabled', () => {
            const dir = writeRulesDir({ 'glje.json': validRaw({ enabled: false }) });
            expect(() => loadRuleSets({ dir })).toThrow(/is disabled/);
        });

        it('throws on a duplicate type', () => {
            const dir = writeRulesDir({ 'a.json': validRaw(), 'b.json': validRaw() });
            expect(() => loadRuleSets({ dir })).toThrow(/Duplicate document type "GLJE"/);
        });

        it('throws on malformed JSON, naming the file', () => {
            const dir = writeRulesDir({ 'broken.json': '{ not json' });
            expect(() => loadRuleSets({ dir })).toThrow(/Could not parse document type rules.*broken\.json/s);
        });

        it('throws when the directory does not exist', () => {
            expect(() => loadRuleSets({ dir: '/no/such/rules/dir' })).toThrow(/directory not found/);
        });

        it('throws when the directory has no rule files', () => {
            expect(() => loadRuleSets({ dir: writeRulesDir({}) })).toThrow(/No document type rule files/);
        });

        it('ignores non-json files', () => {
            const dir = writeRulesDir({ 'glje.json': validRaw(), 'README.md': '# notes' });
            expect(loadRuleSets({ dir })).toHaveLength(1);
        });
    });

    describe('the rule sets shipped in this repo', () => {
        it('all load and validate', () => {
            // COSTING ships disabled: no naming convention exists for it yet.
            expect(getRuleSets().map((r) => r.type).sort()).toEqual(['CHECK', 'GLJE', 'WIRE']);
        });

        it('every rendered-name convention is self-consistent', () => {
            // Guards against a validate regex that no template output could match,
            // which would make every rename look non-compliant forever.
            for (const ruleSet of getRuleSets()) {
                expect(ruleSet.validateRegex).toBeInstanceOf(RegExp);
                expect(templatePlaceholders(ruleSet.template).length).toBeGreaterThan(0);
            }
        });

        it('are all still placeholders pending the real conventions', () => {
            // This test is expected to be updated when real rules land.
            expect(hasPlaceholderRules()).toBe(true);
            expect(placeholderTypes().sort()).toEqual(['CHECK', 'GLJE', 'WIRE']);
        });
    });

    describe('the COSTING rules (shipped disabled)', () => {
        const fsMod = require('fs');
        const pathMod = require('path');

        function loadCosting() {
            const file = pathMod.join(__dirname, '..', '..', 'config', 'document-types', 'costing.json');
            return validateRuleSet(JSON.parse(fsMod.readFileSync(file, 'utf8')), 'costing.json');
        }

        it('is excluded from the active rule sets', () => {
            expect(getRuleSets().map((r) => r.type)).not.toContain('COSTING');
        });

        it('still validates as a well-formed rule set', () => {
            expect(loadCosting().type).toBe('COSTING');
        });

        it('accepts every real OutputBox/COSTING filename', () => {
            // The convention is "{Vendor} -  {InvoiceNumber}.pdf" -- note the
            // separator is space-hyphen-SPACE-SPACE, and vendor names carry
            // spaces, commas, ampersands, parentheses and hyphens.
            const real = [
                'Ai Trading Inc -  AIT-FAM-1406-2024.pdf',
                'BEG4KLOTHING, INC -  B4K26-FA044.pdf',
                'Beg4Kloathing, Inc -  B4K26-FA046.pdf',
                'COMPASS APPAREL INC -  8892-120.pdf',
                'CROWN WISE INTERNATIONAL INDUSTRIAL LIMITED -  FAM-2023-0067-YC-YC23SHA41.pdf',
                'R&G Global Limited Co -  GTGS26290071006.pdf',
                'RAINBOW LINK (BANGLADESH) LTD -  RSLGAPZ60292.pdf',
                'SHANGHAI NANCY SPORTING GOODS CO, LTD -  EQ1787.pdf',
                'YIA-CHYNS ENTERPRISE CO,LTD -  YC26SHA21.pdf',
                'LAYLO LLC -  100456.pdf',
                'Zhangjiagang Unitex Ltd Co -  UX241209103.pdf'
            ];
            const costing = loadCosting();
            real.forEach((name) => {
                expect({ name, compliant: costing.validateRegex.test(name) })
                    .toEqual({ name, compliant: true });
            });
        });

        it('rejects the pre-rename intake names', () => {
            const costing = loadCosting();
            ['Costing_01.pdf', 'costing_Image_001.pdf', 'Costing_Image02.pdf']
                .forEach((n) => expect(costing.validateRegex.test(n)).toBe(false));
        });

        it('extracts the invoice number but not the vendor name', () => {
            // Why COSTING ships disabled. The invoice number comes off the
            // "INVOICE NO." label reliably; the vendor name does not, because
            // letterheads are the most OCR-corrupted part of these pages and
            // only some invoices carry a "VENDOR" label.
            const { extractFields } = require('../document-naming-engine');
            const costing = loadCosting();

            const noVendorLabel = extractFields(
                'INVOICE   NO.:   BIM-26-006\nACCOUNT   NAME:   i,lOLAX TRADING   LIIMITED\n',
                costing
            );
            expect(noVendorLabel.values.invoiceNumber).toBe('BIM-26-006');
            expect(noVendorLabel.missing).toContain('vendorName');

            const withVendorLabel = extractFields(
                'INVOICE NO.r   100456  DATEr 13-06-2025\nVENDOR  LAYLO   LLC  1035   SOUTH GRAND\n',
                costing
            );
            expect(withVendorLabel.values.invoiceNumber).toBe('100456');
            // Truncated: the pattern stops at the double space inside "LAYLO   LLC".
            expect(withVendorLabel.values.vendorName).toBe('LAYLO');
        });
    });

    describe('getRuleSet', () => {
        it('looks up by type, case-insensitively', () => {
            expect(getRuleSet('glje').type).toBe('GLJE');
            expect(getRuleSet('GLJE').type).toBe('GLJE');
        });

        it('returns null for an unknown or empty type', () => {
            expect(getRuleSet('NOPE')).toBeNull();
            expect(getRuleSet('')).toBeNull();
            expect(getRuleSet(null)).toBeNull();
        });
    });

    describe('caching', () => {
        it('returns the same array instance until reset', () => {
            const first = getRuleSets();
            expect(getRuleSets()).toBe(first);
            resetRuleSetCache();
            expect(getRuleSets()).not.toBe(first);
        });

        it('does not cache when an explicit dir is given', () => {
            const dir = writeRulesDir({ 'glje.json': validRaw() });
            expect(getRuleSets({ dir })).not.toBe(getRuleSets({ dir }));
        });
    });
});
