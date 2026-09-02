/**
 * Document Naming Engine
 * Decides whether a filename already follows its document type's convention,
 * extracts the fields a non-compliant file needs from its text, and renders the
 * corrected filename.
 *
 * Sanitisation is applied unconditionally at the end, independent of whatever
 * transforms a rule file declares. Extracted values come from inside documents
 * we do not control, so a vendor name containing a path separator, a quote, or
 * the token separator must not be able to reach a filename.
 */

const { applyTransforms } = require('./document-field-transforms');
const { generateValue } = require('./document-field-generators');

// SharePoint caps a filename at 255 chars and a full path at 400. Renaming into
// a deep folder can breach the path limit long before the name limit, so the
// name is held well below its own ceiling.
const MAX_FILENAME_LENGTH = 200;

// Only what SharePoint actually forbids in a filename is stripped.
//
// This is deliberately permissive: the real conventions in this library keep
// spaces, ampersands, commas, apostrophes and periods inside values -- e.g.
// "Check_38521_LA ANTENA PALLETS & LUMBER SALES INC_1_7_2026.pdf". An
// alphanumeric-only allowlist would mangle those into
// "LAANTENAPALLETSLUMBERSALESINC" and never match the convention.
//
// Underscore is NOT stripped even though it separates tokens: the date
// transforms (date:M_D_YYYY) legitimately emit it, and the per-type validate
// regex already rejects any value that breaks the expected shape.
const FILENAME_ILLEGAL = /["*:<>?/\\|]+/g;
// Matching control characters is the point here: OCR output can carry them and
// they must never reach a filename.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]+/g;

/**
 * Return the lowercased extension of a filename, including the dot.
 * @param {string} fileName
 * @returns {string} e.g. ".pdf", or '' when there is no extension
 */
function getExtension(fileName) {
    if (!fileName || typeof fileName !== 'string') {
        return '';
    }
    const lastDot = fileName.lastIndexOf('.');
    // A leading dot is a hidden file, not an extension.
    if (lastDot <= 0 || lastDot === fileName.length - 1) {
        return '';
    }
    return fileName.slice(lastDot).toLowerCase();
}

/**
 * Strip a filename down to its stem.
 * @param {string} fileName
 * @returns {string}
 */
function getStem(fileName) {
    const ext = getExtension(fileName);
    return ext ? fileName.slice(0, -ext.length) : (fileName || '');
}

/**
 * Force a value into a filename-safe token.
 * @param {string} value
 * @returns {string} Empty string when nothing safe survives
 */
function sanitizeToken(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(CONTROL_CHARS, '')
        .replace(FILENAME_ILLEGAL, '')
        // Collapse internal whitespace runs; OCR text is full of them.
        .replace(/\s{2,}/g, ' ')
        // Collapse and trim hyphen runs so a stripped value cannot leave
        // dangling separators like "ACME--INC".
        .replace(/-{2,}/g, '-')
        .replace(/^[-\s.]+|[-\s.]+$/g, '');
}

/**
 * Does this filename already satisfy its type's convention?
 * @param {string} fileName
 * @param {Object} ruleSet
 * @returns {boolean}
 */
function isCompliant(fileName, ruleSet) {
    if (!fileName || !ruleSet || !ruleSet.validateRegex) {
        return false;
    }
    // Test the whole filename including extension: the validate regexes anchor
    // on the extension, which is part of the convention.
    return ruleSet.validateRegex.test(fileName);
}

/**
 * Is this file one the rule set is willing to handle at all?
 * @param {string} fileName
 * @param {Object} ruleSet
 * @returns {boolean}
 */
function hasSupportedExtension(fileName, ruleSet) {
    const ext = getExtension(fileName);
    if (!ext) {
        return false;
    }
    return ruleSet.extensions.includes(ext);
}

/**
 * Pull every declared field out of the document text.
 *
 * A field that matches but transforms to an empty string counts as missing —
 * that is how an unparseable date is reported rather than silently dropped.
 *
 * @param {string} text - Extracted document text
 * @param {Object} ruleSet
 * @returns {{values: Object, missing: string[]}}
 */
function extractFields(text, ruleSet) {
    const source = text === null || text === undefined ? '' : String(text);
    const values = {};
    const missing = [];

    for (const field of Object.values(ruleSet.fields)) {
        // Generated fields are minted rather than read. Because the value is
        // random, a rendered name is not reproducible across runs -- see
        // document-field-generators.js for what that implies for dry runs.
        if (field.generate) {
            values[field.name] = sanitizeToken(
                applyTransforms(field.transform, generateValue(field.generate, field.length))
            );
            continue;
        }

        // Patterns are tried in order; the first that yields a capture wins.
        // The same field can sit in different places in different document
        // variants -- a wire's amount is on the detail page for international
        // transfers and on page 1 for Fed transfers.
        let raw = null;
        for (const regex of field.regexes || []) {
            const match = source.match(regex);
            if (match && match[1] !== undefined) {
                raw = match[1];
                break;
            }
        }

        if (raw === null) {
            if (field.required) {
                missing.push(field.name);
                continue;
            }
            raw = field.default;
        }

        let value = applyTransforms(field.transform, raw);
        value = sanitizeToken(value);

        if (field.maxLength && value.length > field.maxLength) {
            value = value.slice(0, field.maxLength).replace(/-+$/, '');
        }

        if (value.length === 0) {
            // Fall back to a sanitised default before giving up on an optional field.
            const fallback = field.required ? '' : sanitizeToken(applyTransforms(field.transform, field.default));
            if (fallback.length === 0) {
                missing.push(field.name);
                continue;
            }
            value = fallback;
        }

        values[field.name] = value;
    }

    return { values, missing };
}

/**
 * Render the corrected filename from extracted values.
 * @param {Object} values - Field name to sanitised value
 * @param {Object} ruleSet
 * @param {string} extension - Including the dot, e.g. ".pdf"
 * @returns {{ok: boolean, name: string|null, reason: string|null}}
 */
function renderName(values, ruleSet, extension) {
    const unresolved = [];

    const stem = ruleSet.template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name) => {
        const value = values[name];
        if (value === undefined || value === null || String(value).length === 0) {
            unresolved.push(name);
            return '';
        }
        return value;
    });

    if (unresolved.length > 0) {
        return {
            ok: false,
            name: null,
            reason: `Template placeholders unresolved: ${unresolved.join(', ')}`
        };
    }

    const name = `${stem}${extension || ''}`;

    if (name.length > MAX_FILENAME_LENGTH) {
        return {
            ok: false,
            name: null,
            reason: `Rendered filename is ${name.length} chars, over the ${MAX_FILENAME_LENGTH} limit`
        };
    }

    // The rendered name must satisfy the same regex used to judge compliance.
    // Without this a rename could produce a name the very next sweep considers
    // non-compliant, and the file would be reprocessed forever.
    if (!ruleSet.validateRegex.test(name)) {
        return {
            ok: false,
            name: null,
            reason: `Rendered filename "${name}" does not satisfy the convention for ${ruleSet.type} (${ruleSet.validate})`
        };
    }

    return { ok: true, name, reason: null };
}

/**
 * Full path from document text to a proposed filename.
 * @param {Object} params
 * @param {string} params.fileName - Current filename
 * @param {string} params.text - Extracted document text
 * @param {Object} params.ruleSet
 * @returns {{ok: boolean, name: string|null, values: Object, missing: string[], reason: string|null}}
 */
function buildProposedName({ fileName, text, ruleSet }) {
    const { values, missing } = extractFields(text, ruleSet);

    if (missing.length > 0) {
        return {
            ok: false,
            name: null,
            values,
            missing,
            reason: `Could not extract required field(s): ${missing.join(', ')}`
        };
    }

    const rendered = renderName(values, ruleSet, getExtension(fileName));
    return {
        ok: rendered.ok,
        name: rendered.name,
        values,
        missing: [],
        reason: rendered.reason
    };
}

module.exports = {
    isCompliant,
    hasSupportedExtension,
    extractFields,
    renderName,
    buildProposedName,
    sanitizeToken,
    getExtension,
    getStem,
    MAX_FILENAME_LENGTH
};
