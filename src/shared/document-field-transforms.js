/**
 * Document Field Transforms
 * Named, declarative transforms that rule config files reference by string
 * (e.g. "transform": ["trim", "upper", "alnum"]). Kept in their own module so
 * that document-type-rules.js can validate transform names at load time without
 * depending on the naming engine, and vice versa.
 *
 * Every transform takes a string and returns a string. None of them throw on
 * unexpected input — a field that transforms to '' is treated as a missing
 * field by the naming engine, which is the outcome we want.
 */

// Two-digit years below this pivot are read as 20xx, at or above as 19xx.
const TWO_DIGIT_YEAR_PIVOT = 70;

/**
 * Parse the date formats that actually appear in these documents.
 * US ordering (MM/DD/YYYY) is assumed for the ambiguous cases because the
 * source documents are US-issued financial paperwork.
 * @param {string} value
 * @returns {{year: number, month: number, day: number}|null}
 */
function parseDate(value) {
    const cleaned = String(value).trim();

    // ISO-ish: YYYY-MM-DD or YYYY/MM/DD — a 4-digit leading group is unambiguous
    const iso = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (iso) {
        return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    }

    // US: M/D/YYYY, M-D-YY, MM.DD.YYYY
    const us = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (us) {
        let year = Number(us[3]);
        if (us[3].length === 2) {
            year = year < TWO_DIGIT_YEAR_PIVOT ? 2000 + year : 1900 + year;
        }
        return { year, month: Number(us[1]), day: Number(us[2]) };
    }

    return null;
}

/**
 * Reject dates that parsed structurally but cannot exist (e.g. 13/45/2026).
 * A silently wrong date becomes a silently wrong filename, so this is strict.
 */
function isRealDate({ year, month, day }) {
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }
    const probe = new Date(Date.UTC(year, month - 1, day));
    return probe.getUTCFullYear() === year
        && probe.getUTCMonth() === month - 1
        && probe.getUTCDate() === day;
}

const DATE_FORMATTERS = {
    YYYYMMDD: ({ year, month, day }) =>
        `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    YYYYMM: ({ year, month }) => `${year}${String(month).padStart(2, '0')}`,
    'YYYY-MM-DD': ({ year, month, day }) =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    MMDDYYYY: ({ year, month, day }) =>
        `${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${year}`,
    YYMMDD: ({ year, month, day }) =>
        `${String(year).slice(-2)}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    // Underscore-separated forms, matching the conventions actually in use in
    // this library. Note CHECK does not zero-pad ("Check_..._1_5_2026") while
    // WIRE and GLJE do ("Wire__$18,593.28_02_03_2026"), so both exist.
    'M_D_YYYY': ({ year, month, day }) => `${month}_${day}_${year}`,
    'MM_DD_YYYY': ({ year, month, day }) =>
        `${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}_${year}`
};

const SIMPLE_TRANSFORMS = {
    trim: (value) => value.trim(),
    upper: (value) => value.toUpperCase(),
    lower: (value) => value.toLowerCase(),
    // Keep only digits — for check numbers, amounts, periods.
    digits: (value) => value.replace(/\D+/g, ''),
    // Keep only letters and digits — drops spaces, punctuation, and the
    // separator character, so a vendor name can never inject a token break.
    alnum: (value) => value.replace(/[^A-Za-z0-9]+/g, ''),
    // Collapse internal whitespace runs to a single hyphen, preserving word
    // boundaries where alnum would fuse them together.
    collapse: (value) => value.trim().replace(/\s+/g, '-'),
    // Keep only what can legitimately appear in a figure. OCR injects spaces and
    // apostrophes into amounts ("$1 ,375,'1   1   0.00"); this removes that noise
    // without altering a digit. It CANNOT repair a substituted digit -- "$18,s93.28"
    // becomes "18,93.28", which the per-type validate regex then rejects for
    // malformed thousands grouping rather than letting a wrong figure through.
    numeric: (value) => value.replace(/[^0-9.,]+/g, ''),
    // Group a plain decimal into thousands: "18593.28" -> "18,593.28". Returns
    // '' for anything that is not a well-formed figure, so a mangled value is
    // reported missing rather than formatted into something plausible.
    thousands: (value) => {
        const cleaned = value.replace(/[^0-9.]+/g, '');
        if (!/^\d+\.\d{2}$/.test(cleaned)) {
            return '';
        }
        const [whole, cents] = cleaned.split('.');
        return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
    }
};

/**
 * @param {string} name - Transform name, optionally "date:FORMAT"
 * @returns {boolean} True if the name resolves to a known transform
 */
function isKnownTransform(name) {
    if (typeof name !== 'string') {
        return false;
    }
    if (Object.prototype.hasOwnProperty.call(SIMPLE_TRANSFORMS, name)) {
        return true;
    }
    const dateMatch = name.match(/^date:(.+)$/);
    return Boolean(dateMatch && Object.prototype.hasOwnProperty.call(DATE_FORMATTERS, dateMatch[1]));
}

/**
 * Apply one named transform.
 * @param {string} name
 * @param {string} value
 * @returns {string} Transformed value, or '' if a date could not be parsed
 */
function applyTransform(name, value) {
    const input = value === null || value === undefined ? '' : String(value);

    if (Object.prototype.hasOwnProperty.call(SIMPLE_TRANSFORMS, name)) {
        return SIMPLE_TRANSFORMS[name](input);
    }

    const dateMatch = name.match(/^date:(.+)$/);
    if (dateMatch) {
        const parsed = parseDate(input);
        // An unparseable or impossible date yields '' so the caller reports a
        // missing field rather than embedding garbage in a filename.
        if (!parsed || !isRealDate(parsed)) {
            return '';
        }
        return DATE_FORMATTERS[dateMatch[1]](parsed);
    }

    throw new Error(`Unknown field transform: ${name}`);
}

/**
 * Apply a transform chain in order.
 * @param {string[]} names
 * @param {string} value
 * @returns {string}
 */
function applyTransforms(names, value) {
    const seed = value === null || value === undefined ? '' : String(value);
    return (names || []).reduce((acc, name) => applyTransform(name, acc), seed);
}

module.exports = {
    applyTransform,
    applyTransforms,
    isKnownTransform,
    parseDate,
    isRealDate,
    SIMPLE_TRANSFORMS,
    DATE_FORMATTERS
};
