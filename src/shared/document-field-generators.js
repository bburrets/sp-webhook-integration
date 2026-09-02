/**
 * Document Field Generators
 * Values that are minted at rename time rather than read out of the document.
 *
 * The GLJE convention ends in a random 6-digit id (GLJE_11_03_2025_129334).
 * Nothing in the document carries it — it is generated. That makes it the one
 * field type whose value is not derivable from the file, with three
 * consequences the rest of the pipeline has to respect:
 *
 *   1. A dry run's proposed name will NOT equal the name a later live run
 *      produces. Dry-run output can be checked for SHAPE but not compared
 *      byte-for-byte against what eventually lands.
 *   2. A collision on a generated value carries no information — it is bad luck,
 *      not a duplicate document — so the caller regenerates rather than raising
 *      an exception. Collisions on extracted values still mean something and are
 *      still surfaced.
 *   3. Idempotency still holds, because a file is checked against its
 *      convention BEFORE any value is generated. An already-compliant file is
 *      skipped without ever minting a new number.
 */

const crypto = require('crypto');

const MIN_LENGTH = 1;
const MAX_LENGTH = 18;

const GENERATORS = {
    /**
     * A random decimal string of exactly `length` digits, never leading zero.
     * Matches the observed GLJE ids, which all fall in 100000-999999.
     */
    digits: (length) => {
        const lower = 10 ** (length - 1);
        const upper = 10 ** length;
        // crypto.randomInt is uniform and avoids Math.random's weak entropy;
        // these values end up in filenames people rely on being distinct.
        return String(crypto.randomInt(lower, upper));
    }
};

/**
 * @param {string} name
 * @returns {boolean}
 */
function isKnownGenerator(name) {
    return typeof name === 'string'
        && Object.prototype.hasOwnProperty.call(GENERATORS, name);
}

/**
 * @param {number} length
 * @returns {boolean}
 */
function isValidLength(length) {
    return Number.isInteger(length) && length >= MIN_LENGTH && length <= MAX_LENGTH;
}

/**
 * Mint a value.
 * @param {string} name - Generator name
 * @param {number} length
 * @returns {string}
 */
function generateValue(name, length) {
    if (!isKnownGenerator(name)) {
        throw new Error(`Unknown field generator: ${name}`);
    }
    if (!isValidLength(length)) {
        throw new Error(`Invalid generator length: ${length}`);
    }
    return GENERATORS[name](length);
}

module.exports = {
    generateValue,
    isKnownGenerator,
    isValidLength,
    MIN_LENGTH,
    MAX_LENGTH
};
