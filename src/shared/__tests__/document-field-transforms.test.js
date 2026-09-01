const {
    applyTransform,
    applyTransforms,
    isKnownTransform,
    parseDate,
    isRealDate
} = require('../document-field-transforms');

describe('document-field-transforms', () => {
    describe('simple transforms', () => {
        it('trims surrounding whitespace', () => {
            expect(applyTransform('trim', '  ACME  ')).toBe('ACME');
        });

        it('upper- and lower-cases', () => {
            expect(applyTransform('upper', 'acme')).toBe('ACME');
            expect(applyTransform('lower', 'ACME')).toBe('acme');
        });

        it('keeps only digits', () => {
            expect(applyTransform('digits', '$12,345.67')).toBe('1234567');
            expect(applyTransform('digits', 'Check #000123')).toBe('000123');
        });

        it('keeps only letters and digits', () => {
            expect(applyTransform('alnum', 'Acme Widgets, Inc.')).toBe('AcmeWidgetsInc');
        });

        it('strips the token separator so a value cannot fake a token break', () => {
            expect(applyTransform('alnum', 'ACME_WIDGETS')).toBe('ACMEWIDGETS');
        });

        it('collapses whitespace runs to single hyphens', () => {
            expect(applyTransform('collapse', 'Spring   Summer  26')).toBe('Spring-Summer-26');
        });

        it('treats null and undefined as empty strings', () => {
            expect(applyTransform('trim', null)).toBe('');
            expect(applyTransform('upper', undefined)).toBe('');
        });
    });

    describe('applyTransforms', () => {
        it('applies the chain in order', () => {
            expect(applyTransforms(['trim', 'upper', 'alnum'], '  acme widgets, inc. ')).toBe('ACMEWIDGETSINC');
        });

        it('returns the input unchanged for an empty chain', () => {
            expect(applyTransforms([], 'as-is')).toBe('as-is');
            expect(applyTransforms(undefined, 'as-is')).toBe('as-is');
        });
    });

    describe('parseDate', () => {
        it('parses US ordering', () => {
            expect(parseDate('8/19/2026')).toEqual({ year: 2026, month: 8, day: 19 });
        });

        it('parses ISO ordering by the 4-digit leading group', () => {
            expect(parseDate('2026-08-19')).toEqual({ year: 2026, month: 8, day: 19 });
        });

        it('expands 2-digit years around the pivot', () => {
            expect(parseDate('1/1/69').year).toBe(2069);
            expect(parseDate('1/1/70').year).toBe(1970);
        });

        it('accepts dot and hyphen separators', () => {
            expect(parseDate('08.19.2026')).toEqual({ year: 2026, month: 8, day: 19 });
            expect(parseDate('08-19-2026')).toEqual({ year: 2026, month: 8, day: 19 });
        });

        it('returns null for unparseable input', () => {
            expect(parseDate('sometime last August')).toBeNull();
            expect(parseDate('')).toBeNull();
        });
    });

    describe('isRealDate', () => {
        it('rejects dates that cannot exist', () => {
            expect(isRealDate({ year: 2026, month: 13, day: 1 })).toBe(false);
            expect(isRealDate({ year: 2026, month: 2, day: 30 })).toBe(false);
            expect(isRealDate({ year: 2026, month: 0, day: 10 })).toBe(false);
        });

        it('accepts leap days in leap years only', () => {
            expect(isRealDate({ year: 2024, month: 2, day: 29 })).toBe(true);
            expect(isRealDate({ year: 2026, month: 2, day: 29 })).toBe(false);
        });
    });

    describe('date transforms', () => {
        it('formats to each supported layout', () => {
            expect(applyTransform('date:YYYYMMDD', '8/19/2026')).toBe('20260819');
            expect(applyTransform('date:YYYYMM', '8/19/2026')).toBe('202608');
            expect(applyTransform('date:YYYY-MM-DD', '8/19/2026')).toBe('2026-08-19');
            expect(applyTransform('date:MMDDYYYY', '8/19/2026')).toBe('08192026');
            expect(applyTransform('date:YYMMDD', '8/19/2026')).toBe('260819');
        });

        it('returns empty string for an impossible date so the field reads as missing', () => {
            expect(applyTransform('date:YYYYMMDD', '13/45/2026')).toBe('');
        });

        it('returns empty string for an unparseable date', () => {
            expect(applyTransform('date:YYYYMMDD', 'last Tuesday')).toBe('');
        });
    });

    describe('isKnownTransform', () => {
        it('recognises simple and date transforms', () => {
            expect(isKnownTransform('alnum')).toBe(true);
            expect(isKnownTransform('date:YYYYMMDD')).toBe(true);
        });

        it('rejects unknown names and unknown date formats', () => {
            expect(isKnownTransform('explode')).toBe(false);
            expect(isKnownTransform('date:NOPE')).toBe(false);
            expect(isKnownTransform(null)).toBe(false);
        });

        it('is not fooled by inherited object properties', () => {
            expect(isKnownTransform('constructor')).toBe(false);
            expect(isKnownTransform('toString')).toBe(false);
        });
    });

    it('throws for an unknown transform when actually applied', () => {
        expect(() => applyTransform('explode', 'x')).toThrow(/Unknown field transform/);
    });
});
