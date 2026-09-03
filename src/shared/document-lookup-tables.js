/**
 * Document Lookup Tables
 * Prefix maps that turn one extracted value into another, loaded from
 * src/config/lookups/.
 *
 * The motivating case is COSTING vendor names. The convention is
 * "{Vendor} -  {InvoiceNumber}.pdf", but the vendor name is a poor thing to
 * read off the page: it appears with no consistent label, sits beside the
 * buyer's own name and sometimes a different manufacturer, and the existing
 * filenames spell the same legal form eleven different ways (CO,LTD / CO, LTD /
 * LTD CO / Ltd Co ...). The invoice number, by contrast, is labelled and
 * survives OCR. So the invoice number is the key and the vendor is looked up,
 * which also guarantees one spelling per vendor.
 *
 * Longest matching prefix wins, so a specific entry can override a general one.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_LOOKUP_DIR = path.join(__dirname, '..', 'config', 'lookups');

let cache = null;

/**
 * Validate one raw lookup table into a normalised form.
 * @param {Object} raw - Parsed JSON
 * @param {string} source - File path, for error messages
 * @returns {{name: string, source: string, prefixes: Array<{prefix: string, value: string}>}}
 * @throws {Error} Listing every problem found
 */
function validateLookupTable(raw, source) {
    const problems = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`Invalid lookup table in ${source}: root must be an object`);
    }

    if (!raw.prefixes || typeof raw.prefixes !== 'object' || Array.isArray(raw.prefixes)) {
        problems.push('prefixes must be an object of { "PREFIX": "value" }');
    }

    const entries = [];
    for (const [prefix, value] of Object.entries(raw.prefixes || {})) {
        if (!prefix.trim()) {
            problems.push('a prefix key is empty');
            continue;
        }
        if (typeof value !== 'string' || !value.trim()) {
            problems.push(`prefixes["${prefix}"] must be a non-empty string`);
            continue;
        }
        entries.push({ prefix: prefix.toUpperCase(), value: value.trim() });
    }

    if (entries.length === 0 && problems.length === 0) {
        problems.push('prefixes must declare at least one entry');
    }

    // A duplicate key would silently shadow; JSON.parse already collapses them,
    // so check the raw text instead of the parsed object at load time.
    const seen = new Set();
    for (const { prefix } of entries) {
        if (seen.has(prefix)) {
            problems.push(`duplicate prefix "${prefix}" (case-insensitively)`);
        }
        seen.add(prefix);
    }

    if (problems.length > 0) {
        throw new Error(`Invalid lookup table in ${source}:\n  - ${problems.join('\n  - ')}`);
    }

    return {
        name: path.basename(source, '.json'),
        source,
        // Longest first, so the first match found is also the most specific.
        prefixes: entries.sort((a, b) => b.prefix.length - a.prefix.length)
    };
}

/**
 * Load every lookup table in a directory. An absent directory is not an error:
 * lookups are optional, and no rule set is obliged to use one.
 * @param {Object} [options]
 * @param {string} [options.dir]
 * @returns {Object<string, Object>} Keyed by table name
 */
function loadLookupTables(options = {}) {
    const dir = options.dir || DEFAULT_LOOKUP_DIR;
    const tables = {};

    if (!fs.existsSync(dir)) {
        return tables;
    }

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        const source = path.join(dir, file);
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(source, 'utf8'));
        } catch (error) {
            throw new Error(`Could not parse lookup table in ${source}: ${error.message}`);
        }
        const table = validateLookupTable(raw, source);
        tables[table.name] = table;
    }

    return tables;
}

/**
 * Cached accessor. Tables do not change at runtime.
 * @param {Object} [options]
 * @returns {Object<string, Object>}
 */
function getLookupTables(options = {}) {
    if (options.dir) {
        return loadLookupTables(options);
    }
    if (!cache) {
        cache = loadLookupTables();
    }
    return cache;
}

/**
 * @param {string} name
 * @param {Object} [options]
 * @returns {Object|null}
 */
function getLookupTable(name, options = {}) {
    if (!name) {
        return null;
    }
    return getLookupTables(options)[name] || null;
}

/**
 * Resolve a key against a table by longest matching prefix.
 * @param {Object} table - From getLookupTable
 * @param {string} key
 * @returns {{value: string, prefix: string}|null}
 */
function resolvePrefix(table, key) {
    if (!table || !key) {
        return null;
    }
    const upper = String(key).toUpperCase();
    const hit = table.prefixes.find((entry) => upper.startsWith(entry.prefix));
    return hit ? { value: hit.value, prefix: hit.prefix } : null;
}

/** Clear the module cache. Tests only. */
function resetLookupTableCache() {
    cache = null;
}

module.exports = {
    loadLookupTables,
    getLookupTables,
    getLookupTable,
    validateLookupTable,
    resolvePrefix,
    resetLookupTableCache,
    DEFAULT_LOOKUP_DIR
};
