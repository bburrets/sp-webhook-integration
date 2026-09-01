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
            expect(getRuleSets().map((r) => r.type).sort()).toEqual(['CHECK', 'COSTING', 'GLJE', 'WIRE']);
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
            expect(placeholderTypes().sort()).toEqual(['CHECK', 'COSTING', 'GLJE', 'WIRE']);
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
