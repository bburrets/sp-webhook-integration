const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    loadLookupTables,
    getLookupTable,
    getLookupTables,
    validateLookupTable,
    resolvePrefix,
    resetLookupTableCache
} = require('../document-lookup-tables');

function writeTables(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lookups-'));
    for (const [name, contents] of Object.entries(files)) {
        fs.writeFileSync(
            path.join(dir, name),
            typeof contents === 'string' ? contents : JSON.stringify(contents)
        );
    }
    return dir;
}

describe('document-lookup-tables', () => {
    afterEach(() => resetLookupTableCache());

    describe('validateLookupTable rejects', () => {
        it('a root that is not an object', () => {
            expect(() => validateLookupTable([], 't.json')).toThrow(/root must be an object/);
        });

        it('a missing prefixes block', () => {
            expect(() => validateLookupTable({}, 't.json')).toThrow(/prefixes must be an object/);
        });

        it('an empty prefixes block', () => {
            expect(() => validateLookupTable({ prefixes: {} }, 't.json')).toThrow(/at least one entry/);
        });

        it('a non-string or empty value', () => {
            expect(() => validateLookupTable({ prefixes: { A: 5 } }, 't.json'))
                .toThrow(/must be a non-empty string/);
            expect(() => validateLookupTable({ prefixes: { A: '  ' } }, 't.json'))
                .toThrow(/must be a non-empty string/);
        });

        it('prefixes differing only in case, which would silently shadow', () => {
            expect(() => validateLookupTable({ prefixes: { abc: 'x', ABC: 'y' } }, 't.json'))
                .toThrow(/duplicate prefix "ABC"/);
        });
    });

    describe('validateLookupTable accepts', () => {
        it('a well-formed table and upper-cases the keys', () => {
            const table = validateLookupTable({ prefixes: { idl: 'IDEAL' } }, 'vendors.json');
            expect(table.name).toBe('vendors');
            expect(table.prefixes[0]).toEqual({ prefix: 'IDL', value: 'IDEAL' });
        });

        it('and orders longest prefix first, so the first match is the most specific', () => {
            const table = validateLookupTable({
                prefixes: { B: 'short', B4K26: 'long', B4K: 'medium' }
            }, 't.json');
            expect(table.prefixes.map((e) => e.prefix)).toEqual(['B4K26', 'B4K', 'B']);
        });
    });

    describe('resolvePrefix', () => {
        const table = validateLookupTable({
            prefixes: { B4K26: 'BEG4KLOTHING, INC', B4K: 'Some Other Vendor', IDL: 'IDEAL' }
        }, 't.json');

        it('matches by prefix, case-insensitively', () => {
            expect(resolvePrefix(table, 'idl260064').value).toBe('IDEAL');
        });

        it('prefers the longest matching prefix', () => {
            // B4K26-FA044 matches both B4K and B4K26; the specific one must win.
            expect(resolvePrefix(table, 'B4K26-FA044').value).toBe('BEG4KLOTHING, INC');
            expect(resolvePrefix(table, 'B4K99-XX').value).toBe('Some Other Vendor');
        });

        it('returns null for an unknown key, so the caller can fall back', () => {
            expect(resolvePrefix(table, '100456')).toBeNull();
        });

        it('handles missing inputs', () => {
            expect(resolvePrefix(null, 'IDL')).toBeNull();
            expect(resolvePrefix(table, '')).toBeNull();
            expect(resolvePrefix(table, null)).toBeNull();
        });
    });

    describe('loadLookupTables', () => {
        it('loads each file, keyed by filename', () => {
            const dir = writeTables({
                'vendors.json': { prefixes: { A: 'Alpha' } },
                'banks.json': { prefixes: { B: 'Beta' } }
            });
            expect(Object.keys(loadLookupTables({ dir })).sort()).toEqual(['banks', 'vendors']);
        });

        it('treats an absent directory as no tables, since lookups are optional', () => {
            expect(loadLookupTables({ dir: '/no/such/lookup/dir' })).toEqual({});
        });

        it('throws on malformed JSON, naming the file', () => {
            const dir = writeTables({ 'broken.json': '{ not json' });
            expect(() => loadLookupTables({ dir })).toThrow(/Could not parse lookup table.*broken\.json/s);
        });

        it('ignores non-json files', () => {
            const dir = writeTables({ 'vendors.json': { prefixes: { A: 'Alpha' } }, 'README.md': '#' });
            expect(Object.keys(loadLookupTables({ dir }))).toEqual(['vendors']);
        });
    });

    describe('the vendors table shipped in this repo', () => {
        it('loads and validates', () => {
            expect(getLookupTable('vendors')).not.toBeNull();
        });

        it('resolves every invoice prefix observed in OutputBox/COSTING', () => {
            const table = getLookupTable('vendors');
            const expected = {
                'AIT-FAM-1406-2024': 'Ai Trading Inc',
                'B4K26-FA044': 'BEG4KLOTHING, INC',
                'B4K26FA052A': 'BEG4KLOTHING, INC',
                '8892-120': 'COMPASS APPAREL INC',
                'GRTX-SIL-020-2026': 'GARTEX OVERSEAS LIMITED',
                'IDL260064': 'IDEAL GROUP HOLDINGS LIMITED',
                'IKVF-260327': 'INKYUNG APPAREL LTD CO',
                'JOFFAM26018': 'Jumeirah Overseas FZE',
                'BIM-26-006': 'MOLAX TRADING LIMITED',
                'GTGS26290071006': 'R&G Global Limited Co',
                'RSLGAPZ60292': 'RAINBOW LINK (BANGLADESH) LTD',
                'TISLFAM-02225': 'RAINBOW LINK (BANGLADESH) LTD',
                'EQ1787': 'SHANGHAI NANCY SPORTING GOODS CO, LTD',
                'TGL-MARIKA-25-26-017': 'TELIS GLOBAL LIMITED',
                'YC26SHA21': 'YIA-CHYNS ENTERPRISE CO,LTD',
                'YK26110': 'YINTAK INTEX CO,LTD',
                'UX241209103': 'Zhangjiagang Unitex Ltd Co'
            };
            for (const [invoice, vendor] of Object.entries(expected)) {
                const hit = resolvePrefix(table, invoice);
                expect({ invoice, vendor: hit && hit.value }).toEqual({ invoice, vendor });
            }
        });

        it('deliberately omits LAYLO, whose invoices are bare digits', () => {
            // No prefix to key on, so it must resolve via the extraction fallback.
            const table = getLookupTable('vendors');
            expect(resolvePrefix(table, '100456')).toBeNull();
            expect(resolvePrefix(table, '100457')).toBeNull();
        });

        it('maps both RAINBOW LINK prefixes to one canonical name', () => {
            const table = getLookupTable('vendors');
            expect(resolvePrefix(table, 'RSLGAPZ60292').value)
                .toBe(resolvePrefix(table, 'TISLFAM-02225').value);
        });
    });

    describe('caching', () => {
        it('returns the same object until reset', () => {
            const first = getLookupTables();
            expect(getLookupTables()).toBe(first);
            resetLookupTableCache();
            expect(getLookupTables()).not.toBe(first);
        });
    });
});
