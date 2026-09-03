const { parseSharePointUrl, pathSegments } = require('../sharepoint-url');

const HOST = 'https://fambrandsllc.sharepoint.com';

describe('sharepoint-url', () => {
    describe('pathSegments', () => {
        it('splits and decodes, dropping empties', () => {
            expect(pathSegments('/sites/Accounting%5FResearch/Shared%20Documents/'))
                .toEqual(['sites', 'Accounting_Research', 'Shared Documents']);
        });

        it('survives a malformed escape rather than throwing', () => {
            expect(pathSegments('/a/%zz/b')).toEqual(['a', '%zz', 'b']);
        });

        it('handles empty input', () => {
            expect(pathSegments('')).toEqual([]);
            expect(pathSegments(null)).toEqual([]);
        });
    });

    describe('parseSharePointUrl', () => {
        it('parses a library root view page', () => {
            expect(parseSharePointUrl(`${HOST}/sites/Accounting_Research/OutputBox/Forms/AllItems.aspx`))
                .toMatchObject({
                    hostname: 'fambrandsllc.sharepoint.com',
                    siteName: 'Accounting_Research',
                    sitePath: 'fambrandsllc.sharepoint.com:/sites/Accounting_Research:',
                    libraryName: 'OutputBox',
                    folderPath: '',
                    isRoot: true
                });
        });

        it('prefers the id parameter, which is what the address bar carries in a subfolder', () => {
            const url = `${HOST}/sites/Accounting_Research/OutputBox/Forms/AllItems.aspx`
                + '?id=%2Fsites%2FAccounting%5FResearch%2FOutputBox%2FCOSTING'
                + '&viewid=0cd653a4%2D4a66%2D469a%2D9a98%2Dcb7b6f951f07'
                + '&newTargetListUrl=%2Fsites%2FAccounting%5FResearch%2FOutputBox';
            expect(parseSharePointUrl(url)).toMatchObject({
                libraryName: 'OutputBox',
                folderPath: 'COSTING',
                isRoot: false
            });
        });

        it('parses a RootFolder parameter', () => {
            const url = `${HOST}/sites/Accounting_Research/OutputBox/Forms/AllItems.aspx`
                + '?RootFolder=/sites/Accounting_Research/OutputBox/WIRE/2025_11';
            expect(parseSharePointUrl(url).folderPath).toBe('WIRE/2025_11');
        });

        it('parses a direct folder path with no view page', () => {
            expect(parseSharePointUrl(`${HOST}/sites/Accounting_Research/OutputBox/CHECK/2026/2026_01`))
                .toMatchObject({ libraryName: 'OutputBox', folderPath: 'CHECK/2026/2026_01' });
        });

        it('decodes a library name containing a space', () => {
            expect(parseSharePointUrl(`${HOST}/sites/Accounting_Research/Shared%20Documents/Forms/AllItems.aspx`))
                .toMatchObject({ libraryName: 'Shared Documents', folderPath: '' });
        });

        it('decodes an encoded site name', () => {
            const url = `${HOST}/sites/Accounting_Research/OutputBox/Forms/AllItems.aspx`
                + '?id=%2Fsites%2FAccounting%5FResearch%2FOutputBox%2FIntake%5FChecks';
            expect(parseSharePointUrl(url).folderPath).toBe('Intake_Checks');
        });

        it('keeps a folder legitimately named Forms when no view page follows', () => {
            expect(parseSharePointUrl(`${HOST}/sites/Site/Library/Forms`).folderPath).toBe('Forms');
        });

        it('rejects input that is not a URL', () => {
            expect(() => parseSharePointUrl('not a url')).toThrow(/Not a valid URL/);
            expect(() => parseSharePointUrl('')).toThrow(/SharePoint URL is required/);
            expect(() => parseSharePointUrl(null)).toThrow(/SharePoint URL is required/);
        });

        it('rejects a non-http scheme', () => {
            expect(() => parseSharePointUrl('ftp://host/sites/Site/Library')).toThrow(/Not an http/);
        });

        it('rejects a URL with no /sites/ segment', () => {
            expect(() => parseSharePointUrl('https://host/personal/someone/Documents'))
                .toThrow(/Could not find a \/sites\/\{name\} segment/);
        });

        it('rejects a site URL with no library, and says what to do', () => {
            expect(() => parseSharePointUrl(`${HOST}/sites/Accounting_Research`))
                .toThrow(/points at the site, not a document library/);
        });

        it('tolerates surrounding whitespace from a paste', () => {
            expect(parseSharePointUrl(`  ${HOST}/sites/Site/Library  `).libraryName).toBe('Library');
        });
    });
});
