/**
 * Document Type Rules
 * Loads and validates the declarative rule sets in src/config/document-types/.
 *
 * Validation runs at load time and throws on any problem. That is deliberate:
 * a rule file with a typo'd regex or a template placeholder that no field
 * supplies would otherwise produce confidently wrong filenames in production,
 * which is far worse than the function app refusing to start.
 *
 * Any rule set still marked `"placeholder": true` means its convention has not
 * been supplied yet. hasPlaceholderRules() lets the worker force dry-run in
 * that state so guessed patterns can never rename a real file.
 */

const fs = require('fs');
const path = require('path');
const { isKnownTransform } = require('./document-field-transforms');
const { isKnownGenerator, isValidLength } = require('./document-field-generators');

const DEFAULT_RULES_DIR = path.join(__dirname, '..', 'config', 'document-types');
const TEMPLATE_PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

let cache = null;

/**
 * Compile a regex, collecting a readable problem instead of throwing raw.
 * @returns {RegExp|null}
 */
function compilePattern(pattern, label, problems, flags = '') {
    if (typeof pattern !== 'string' || pattern.length === 0) {
        problems.push(`${label} must be a non-empty string`);
        return null;
    }
    try {
        return new RegExp(pattern, flags);
    } catch (error) {
        problems.push(`${label} is not a valid regex: ${error.message}`);
        return null;
    }
}

/**
 * Extract the {placeholder} names a template references.
 * @param {string} template
 * @returns {string[]}
 */
function templatePlaceholders(template) {
    const names = [];
    let match;
    TEMPLATE_PLACEHOLDER.lastIndex = 0;
    while ((match = TEMPLATE_PLACEHOLDER.exec(template)) !== null) {
        names.push(match[1]);
    }
    return names;
}

function validateFields(raw, problems) {
    const fields = {};

    if (!raw.fields || typeof raw.fields !== 'object' || Array.isArray(raw.fields)) {
        problems.push('fields must be an object');
        return fields;
    }

    const names = Object.keys(raw.fields);
    if (names.length === 0) {
        problems.push('fields must declare at least one field');
    }

    for (const name of names) {
        const spec = raw.fields[name];
        if (!spec || typeof spec !== 'object') {
            problems.push(`fields.${name} must be an object`);
            continue;
        }

        // A field is either read out of the document or minted at rename time.
        const isGenerated = spec.generate !== undefined;

        if (isGenerated && spec.pattern !== undefined) {
            problems.push(`fields.${name} cannot declare both "pattern" and "generate"`);
        }

        let regex = null;
        if (isGenerated) {
            if (!isKnownGenerator(spec.generate)) {
                problems.push(`fields.${name}.generate is not a known generator: "${spec.generate}"`);
            }
            if (!isValidLength(spec.length)) {
                problems.push(`fields.${name}.length must be a positive integer when "generate" is set`);
            }
            if (spec.required === false) {
                // A generated value is always producible, so optional is meaningless.
                problems.push(`fields.${name} is generated, so it cannot be optional`);
            }
        } else {
            // Case-insensitive: source documents vary in capitalisation between
            // vendors and systems, and no pattern here depends on case to match.
            regex = compilePattern(spec.pattern, `fields.${name}.pattern`, problems, 'i');
            if (regex && regex.source.indexOf('(') === -1) {
                problems.push(`fields.${name}.pattern must contain a capture group`);
            }
        }

        const transform = spec.transform === undefined ? [] : spec.transform;
        if (!Array.isArray(transform)) {
            problems.push(`fields.${name}.transform must be an array`);
        } else {
            for (const transformName of transform) {
                if (!isKnownTransform(transformName)) {
                    problems.push(`fields.${name}.transform contains unknown transform "${transformName}"`);
                }
            }
        }

        if (spec.maxLength !== undefined
            && (!Number.isInteger(spec.maxLength) || spec.maxLength < 1)) {
            problems.push(`fields.${name}.maxLength must be a positive integer`);
        }

        const required = spec.required === undefined ? true : spec.required;
        if (typeof required !== 'boolean') {
            problems.push(`fields.${name}.required must be a boolean`);
        }

        if (!isGenerated && required === false && spec.default === undefined) {
            problems.push(`fields.${name} is optional so it must declare a "default"`);
        }

        fields[name] = {
            name,
            pattern: spec.pattern,
            regex,
            generate: isGenerated ? spec.generate : null,
            length: isGenerated ? spec.length : null,
            required: isGenerated ? true : required !== false,
            default: spec.default === undefined ? null : String(spec.default),
            transform: Array.isArray(transform) ? transform : [],
            maxLength: spec.maxLength === undefined ? null : spec.maxLength
        };
    }

    return fields;
}

function validateClassify(raw, problems) {
    const classify = raw.classify || {};
    const folderHints = classify.folderHints === undefined ? [] : classify.folderHints;
    const filenameHints = classify.filenameHints === undefined ? [] : classify.filenameHints;

    if (!Array.isArray(folderHints) || folderHints.some((hint) => typeof hint !== 'string')) {
        problems.push('classify.folderHints must be an array of strings');
    }
    const contentPatterns = classify.contentPatterns === undefined ? [] : classify.contentPatterns;

    if (!Array.isArray(filenameHints) || filenameHints.some((hint) => typeof hint !== 'string')) {
        problems.push('classify.filenameHints must be an array of strings');
    }
    if (!Array.isArray(contentPatterns)) {
        problems.push('classify.contentPatterns must be an array of strings');
    }

    const contentRegexes = [];
    if (Array.isArray(contentPatterns)) {
        contentPatterns.forEach((pattern, index) => {
            const regex = compilePattern(pattern, `classify.contentPatterns[${index}]`, problems, 'i');
            if (regex) {
                contentRegexes.push(regex);
            }
        });
    }

    if (Array.isArray(folderHints) && folderHints.length === 0
        && Array.isArray(filenameHints) && filenameHints.length === 0
        && Array.isArray(contentPatterns) && contentPatterns.length === 0) {
        problems.push('classify must declare at least one folderHint, filenameHint or contentPattern');
    }

    const minMatches = classify.minMatches === undefined ? 1 : classify.minMatches;
    if (!Number.isInteger(minMatches) || minMatches < 1) {
        problems.push('classify.minMatches must be a positive integer');
    }

    return {
        folderHints: (Array.isArray(folderHints) ? folderHints : []).map((h) => String(h).toLowerCase()),
        filenameHints: (Array.isArray(filenameHints) ? filenameHints : []).map((h) => String(h).toLowerCase()),
        contentPatterns: Array.isArray(contentPatterns) ? contentPatterns : [],
        contentRegexes,
        minMatches
    };
}

/**
 * Validate one raw rule object into a normalised rule set.
 * @param {Object} raw - Parsed JSON
 * @param {string} source - File path, for error messages
 * @returns {Object} Normalised rule set
 * @throws {Error} If the rule set is invalid, listing every problem found
 */
function validateRuleSet(raw, source) {
    const problems = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`Invalid document type rules in ${source}: root must be an object`);
    }

    if (typeof raw.type !== 'string' || raw.type.trim().length === 0) {
        problems.push('type must be a non-empty string');
    } else if (raw.type !== raw.type.toUpperCase()) {
        problems.push(`type "${raw.type}" must be uppercase`);
    }

    const extensions = raw.extensions === undefined ? ['.pdf'] : raw.extensions;
    if (!Array.isArray(extensions) || extensions.length === 0
        || extensions.some((ext) => typeof ext !== 'string' || !ext.startsWith('.'))) {
        problems.push('extensions must be a non-empty array of strings starting with "."');
    }

    const classify = validateClassify(raw, problems);
    const fields = validateFields(raw, problems);

    if (typeof raw.template !== 'string' || raw.template.trim().length === 0) {
        problems.push('template must be a non-empty string');
    } else {
        const placeholders = templatePlaceholders(raw.template);
        if (placeholders.length === 0) {
            problems.push('template must contain at least one {placeholder}');
        }
        // The core guard: a placeholder no field supplies would render as a
        // literal "{foo}" in a real filename.
        for (const placeholder of placeholders) {
            if (!Object.prototype.hasOwnProperty.call(fields, placeholder)) {
                problems.push(`template references {${placeholder}} but no such field is declared`);
            }
        }
        // The inverse is only a warning-level concern, but an unused field is
        // almost always a rename that silently drops a token, so treat it hard.
        for (const fieldName of Object.keys(fields)) {
            if (!placeholders.includes(fieldName)) {
                problems.push(`field "${fieldName}" is declared but never used in the template`);
            }
        }
    }

    const validateRegex = compilePattern(raw.validate, 'validate', problems);

    if (problems.length > 0) {
        throw new Error(
            `Invalid document type rules in ${source}:\n  - ${problems.join('\n  - ')}`
        );
    }

    return {
        type: raw.type,
        source,
        placeholder: raw.placeholder === true,
        enabled: raw.enabled !== false,
        extensions: extensions.map((ext) => ext.toLowerCase()),
        classify,
        fields,
        template: raw.template,
        validate: raw.validate,
        validateRegex
    };
}

/**
 * Load every rule set from a directory.
 * @param {Object} [options]
 * @param {string} [options.dir] - Directory of .json rule files
 * @returns {Object[]} Validated, enabled rule sets
 */
function loadRuleSets(options = {}) {
    const dir = options.dir || DEFAULT_RULES_DIR;

    if (!fs.existsSync(dir)) {
        throw new Error(`Document type rules directory not found: ${dir}`);
    }

    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
    if (files.length === 0) {
        throw new Error(`No document type rule files found in ${dir}`);
    }

    const ruleSets = [];
    const seenTypes = new Set();

    for (const file of files) {
        const source = path.join(dir, file);
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(source, 'utf8'));
        } catch (error) {
            throw new Error(`Could not parse document type rules in ${source}: ${error.message}`);
        }

        const ruleSet = validateRuleSet(raw, source);

        if (seenTypes.has(ruleSet.type)) {
            throw new Error(`Duplicate document type "${ruleSet.type}" declared in ${source}`);
        }
        seenTypes.add(ruleSet.type);

        if (ruleSet.enabled) {
            ruleSets.push(ruleSet);
        }
    }

    if (ruleSets.length === 0) {
        throw new Error(`Every document type rule set in ${dir} is disabled`);
    }

    return ruleSets;
}

/**
 * Cached accessor. Rule files do not change at runtime.
 * @param {Object} [options]
 * @returns {Object[]}
 */
function getRuleSets(options = {}) {
    if (options.dir) {
        return loadRuleSets(options);
    }
    if (!cache) {
        cache = loadRuleSets();
    }
    return cache;
}

/**
 * Look up one rule set by document type.
 * @param {string} type
 * @param {Object} [options]
 * @returns {Object|null}
 */
function getRuleSet(type, options = {}) {
    if (!type) {
        return null;
    }
    const wanted = String(type).toUpperCase();
    return getRuleSets(options).find((ruleSet) => ruleSet.type === wanted) || null;
}

/**
 * True when any active rule set is still using placeholder patterns. The worker
 * uses this to refuse renames outright, independent of RENAME_DRY_RUN.
 * @param {Object} [options]
 * @returns {boolean}
 */
function hasPlaceholderRules(options = {}) {
    return getRuleSets(options).some((ruleSet) => ruleSet.placeholder);
}

/**
 * Names of the rule sets still using placeholder patterns.
 * @param {Object} [options]
 * @returns {string[]}
 */
function placeholderTypes(options = {}) {
    return getRuleSets(options).filter((r) => r.placeholder).map((r) => r.type);
}

/**
 * Does this rule set mint any value at rename time?
 *
 * The worker uses this to decide what a name collision means: on a generated
 * value it is bad luck and worth regenerating, on an extracted value it is
 * information and belongs on the exception path.
 *
 * @param {Object} ruleSet
 * @returns {boolean}
 */
function hasGeneratedFields(ruleSet) {
    return Object.values(ruleSet?.fields || {}).some((field) => field.generate !== null);
}

/** Clear the module cache. Tests only. */
function resetRuleSetCache() {
    cache = null;
}

module.exports = {
    loadRuleSets,
    getRuleSets,
    getRuleSet,
    validateRuleSet,
    templatePlaceholders,
    hasPlaceholderRules,
    placeholderTypes,
    hasGeneratedFields,
    resetRuleSetCache,
    DEFAULT_RULES_DIR
};
