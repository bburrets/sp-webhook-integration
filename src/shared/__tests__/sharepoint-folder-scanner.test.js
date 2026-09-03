jest.mock('../graph-request', () => ({ graphRequest: jest.fn() }));
jest.mock('../logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const { graphRequest } = require('../graph-request');
const {
    listFolderFiles,
    getFileById,
    resolveDrive,
    buildChildrenUrl,
    encodeFolderPath,
    normaliseFile,
    MAX_ITEMS
} = require('../sharepoint-folder-scanner');

const SITE_PATH = 'host.sharepoint.com:/sites/Accounting_Research:';

/** A Graph driveItem for a file. */
function driveItemFile(overrides = {}) {
    return {
        id: 'item-1',
        name: 'scan_0417.pdf',
        size: 1024,
        lastModifiedDateTime: '2026-08-30T10:00:00Z',
        webUrl: 'https://host/scan_0417.pdf',
        file: { hashes: { sha1Hash: 'HASH1' } },
        parentReference: { driveId: 'drive-1', path: '/drive/root:/Inbox' },
        '@microsoft.graph.downloadUrl': 'https://presigned/scan_0417.pdf',
        listItem: { id: '42', fields: { RenameStatus: 'MissingFields', RenameAttempts: 2 } },
        ...overrides
    };
}

describe('sharepoint-folder-scanner', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('encodeFolderPath', () => {
        it('encodes each segment but keeps separators', () => {
            expect(encodeFolderPath('Shared Documents/FIN SCAN')).toBe('Shared%20Documents/FIN%20SCAN');
        });

        it('encodes characters that would break the URL', () => {
            expect(encodeFolderPath('A&B/C#D')).toBe('A%26B/C%23D');
        });

        it('drops empty segments from leading and trailing slashes', () => {
            expect(encodeFolderPath('/Inbox/')).toBe('Inbox');
        });
    });

    describe('buildChildrenUrl', () => {
        it('addresses the drive root when no folder is given', () => {
            const url = buildChildrenUrl({ sitePath: SITE_PATH });
            expect(url).toContain(`/sites/${SITE_PATH}/drive/root/children`);
        });

        it('uses path addressing for a folder', () => {
            const url = buildChildrenUrl({ sitePath: SITE_PATH, folderPath: 'Shared Documents/Inbox' });
            expect(url).toContain('/drive/root:/Shared%20Documents/Inbox:/children');
        });

        it('prefers an explicit driveId over the site path', () => {
            const url = buildChildrenUrl({ driveId: 'b!abc', folderPath: 'Inbox' });
            expect(url).toContain('/drives/b!abc/root:/Inbox:/children');
            expect(url).not.toContain('/sites/');
        });

        it('expands listItem fields so status columns arrive with the listing', () => {
            const url = buildChildrenUrl({ sitePath: SITE_PATH });
            expect(url).toContain('$expand=listItem($expand=fields)');
        });

        it('requests a full page', () => {
            expect(buildChildrenUrl({ sitePath: SITE_PATH })).toContain('$top=200');
        });
    });

    describe('normaliseFile', () => {
        it('flattens the fields the pipeline needs', () => {
            const file = normaliseFile(driveItemFile());
            expect(file).toMatchObject({
                driveItemId: 'item-1',
                driveId: 'drive-1',
                name: 'scan_0417.pdf',
                sha1Hash: 'HASH1',
                downloadUrl: 'https://presigned/scan_0417.pdf',
                listItemId: '42'
            });
            expect(file.fields.RenameStatus).toBe('MissingFields');
        });

        it('tolerates a driveItem missing optional structures', () => {
            const file = normaliseFile({ id: 'x', name: 'y.pdf' });
            expect(file).toMatchObject({ driveId: null, sha1Hash: null, listItemId: null, downloadUrl: null });
            expect(file.fields).toEqual({});
        });

        it('keeps the raw driveItem so the extractor can use the pre-signed URL', () => {
            const raw = driveItemFile();
            expect(normaliseFile(raw).driveItem).toBe(raw);
        });
    });

    describe('listFolderFiles', () => {
        it('returns the files in a single-page folder', async () => {
            graphRequest.mockResolvedValue({ data: { value: [driveItemFile()] } });
            const result = await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH, folderPath: 'Inbox' });
            expect(result.files).toHaveLength(1);
            expect(result.truncated).toBe(false);
        });

        it('follows @odata.nextLink to completion', async () => {
            // The bug this must not repeat: getRecentItems reads one page and
            // silently drops the rest, making $top a truncation ceiling.
            graphRequest
                .mockResolvedValueOnce({
                    data: {
                        value: [driveItemFile({ id: 'a', name: 'a.pdf' })],
                        '@odata.nextLink': 'https://g/page2'
                    }
                })
                .mockResolvedValueOnce({
                    data: {
                        value: [driveItemFile({ id: 'b', name: 'b.pdf' })],
                        '@odata.nextLink': 'https://g/page3'
                    }
                })
                .mockResolvedValueOnce({ data: { value: [driveItemFile({ id: 'c', name: 'c.pdf' })] } });

            const result = await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH });
            expect(graphRequest).toHaveBeenCalledTimes(3);
            expect(result.files.map((f) => f.driveItemId)).toEqual(['a', 'b', 'c']);
            expect(graphRequest.mock.calls[1][0].url).toBe('https://g/page2');
        });

        it('excludes folders and counts them separately', async () => {
            graphRequest.mockResolvedValue({
                data: {
                    value: [
                        driveItemFile(),
                        { id: 'f1', name: 'Sub', folder: { childCount: 3 } }
                    ]
                }
            });
            const result = await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH });
            expect(result.files).toHaveLength(1);
            expect(result.folderCount).toBe(1);
        });

        it('does not recurse into sub-folders', async () => {
            graphRequest.mockResolvedValue({
                data: { value: [{ id: 'f1', name: 'Sub', folder: { childCount: 3 } }] }
            });
            await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH });
            expect(graphRequest).toHaveBeenCalledTimes(1);
        });

        it('skips items that are neither file nor folder', async () => {
            graphRequest.mockResolvedValue({
                data: { value: [{ id: 'p1', name: 'Notebook', package: { type: 'oneNote' } }] }
            });
            expect((await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH })).files).toHaveLength(0);
        });

        it('stops and flags truncation at the item ceiling', async () => {
            const page = Array.from({ length: MAX_ITEMS }, (_v, i) =>
                driveItemFile({ id: `i${i}`, name: `f${i}.pdf` }));
            graphRequest.mockResolvedValue({ data: { value: page, '@odata.nextLink': 'https://g/next' } });

            const result = await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH });
            expect(result.truncated).toBe(true);
            expect(graphRequest).toHaveBeenCalledTimes(1);
        });

        it('handles an empty folder', async () => {
            graphRequest.mockResolvedValue({ data: { value: [] } });
            const result = await listFolderFiles({ accessToken: 't', sitePath: SITE_PATH });
            expect(result.files).toEqual([]);
        });

        it('propagates a Graph failure so the caller can retry', async () => {
            graphRequest.mockRejectedValue(new Error('Graph down'));
            await expect(listFolderFiles({ accessToken: 't', sitePath: SITE_PATH })).rejects.toThrow('Graph down');
        });
    });

    describe('resolveDrive', () => {
        it('matches a library by drive name', async () => {
            graphRequest.mockResolvedValue({
                data: { value: [{ id: 'd1', name: 'OutputBox', webUrl: 'https://h/sites/X/OutputBox' }] }
            });
            const drive = await resolveDrive({ accessToken: 't', sitePath: SITE_PATH, libraryName: 'OutputBox' });
            expect(drive.id).toBe('d1');
        });

        it('matches the default library by its webUrl tail', async () => {
            // The default library's drive is named "Documents" while its URL
            // says "Shared Documents".
            graphRequest.mockResolvedValue({
                data: {
                    value: [{
                        id: 'd2',
                        name: 'Documents',
                        webUrl: 'https://h/sites/X/Shared%20Documents'
                    }]
                }
            });
            const drive = await resolveDrive({
                accessToken: 't', sitePath: SITE_PATH, libraryName: 'Shared Documents'
            });
            expect(drive.id).toBe('d2');
        });

        it('is case-insensitive', async () => {
            graphRequest.mockResolvedValue({
                data: { value: [{ id: 'd1', name: 'OutputBox', webUrl: 'https://h/x' }] }
            });
            expect((await resolveDrive({
                accessToken: 't', sitePath: SITE_PATH, libraryName: 'outputbox'
            })).id).toBe('d1');
        });

        it('lists what is available when the library is not found', async () => {
            graphRequest.mockResolvedValue({
                data: { value: [{ id: 'd1', name: 'Documents', webUrl: 'https://h/x' }] }
            });
            await expect(resolveDrive({
                accessToken: 't', sitePath: SITE_PATH, libraryName: 'Nope'
            })).rejects.toThrow(/No document library named "Nope".*Available: Documents/s);
        });
    });

    describe('recursive traversal', () => {
        /** A Graph folder child. */
        const folder = (name) => ({ id: `f-${name}`, name, folder: { childCount: 1 } });

        it('walks subfolders when recursive', async () => {
            graphRequest
                .mockResolvedValueOnce({ data: { value: [folder('CHECK')] } })
                .mockResolvedValueOnce({ data: { value: [folder('2026')] } })
                .mockResolvedValueOnce({ data: { value: [driveItemFile({ id: 'x', name: 'x.pdf' })] } });

            const result = await listFolderFiles({
                accessToken: 't', driveId: 'd1', recursive: true
            });

            expect(graphRequest).toHaveBeenCalledTimes(3);
            expect(result.files).toHaveLength(1);
            expect(result.foldersVisited).toBe(3);
        });

        it('records each file\'s folder path, which identifies its type', async () => {
            graphRequest
                .mockResolvedValueOnce({ data: { value: [folder('WIRE')] } })
                .mockResolvedValueOnce({ data: { value: [driveItemFile({ id: 'x', name: 'x.pdf' })] } });

            const result = await listFolderFiles({
                accessToken: 't', driveId: 'd1', recursive: true
            });
            expect(result.files[0].folderPath).toBe('WIRE');
        });

        it('builds nested paths correctly', async () => {
            graphRequest
                .mockResolvedValueOnce({ data: { value: [folder('CHECK')] } })
                .mockResolvedValueOnce({ data: { value: [folder('2026')] } })
                .mockResolvedValueOnce({ data: { value: [driveItemFile({ id: 'x', name: 'x.pdf' })] } });

            const result = await listFolderFiles({
                accessToken: 't', driveId: 'd1', recursive: true
            });
            expect(result.files[0].folderPath).toBe('CHECK/2026');
        });

        it('does not descend when recursive is false', async () => {
            graphRequest.mockResolvedValue({ data: { value: [folder('CHECK')] } });
            const result = await listFolderFiles({
                accessToken: 't', driveId: 'd1', recursive: false
            });
            expect(graphRequest).toHaveBeenCalledTimes(1);
            expect(result.foldersVisited).toBe(1);
        });

        it('starts from a subfolder when given one', async () => {
            graphRequest.mockResolvedValue({ data: { value: [] } });
            await listFolderFiles({
                accessToken: 't', driveId: 'd1', folderPath: 'CHECK/2026', recursive: true
            });
            expect(graphRequest.mock.calls[0][0].url).toContain('root:/CHECK/2026:/children');
        });
    });

    describe('getFileById', () => {
        it('returns the normalised file', async () => {
            graphRequest.mockResolvedValue({ data: driveItemFile() });
            const file = await getFileById({ accessToken: 't', driveId: 'drive-1', driveItemId: 'item-1' });
            expect(file.name).toBe('scan_0417.pdf');
        });

        it('expands listItem fields', async () => {
            graphRequest.mockResolvedValue({ data: driveItemFile() });
            await getFileById({ accessToken: 't', driveId: 'd', driveItemId: 'i' });
            expect(graphRequest.mock.calls[0][0].url).toContain('$expand=listItem($expand=fields)');
        });

        it('returns null when the file no longer exists', async () => {
            const error = new Error('gone');
            error.response = { status: 404 };
            graphRequest.mockRejectedValue(error);
            expect(await getFileById({ accessToken: 't', driveId: 'd', driveItemId: 'i' })).toBeNull();
        });

        it('returns null when the item is not a file', async () => {
            graphRequest.mockResolvedValue({ data: { id: 'f', name: 'Sub', folder: {} } });
            expect(await getFileById({ accessToken: 't', driveId: 'd', driveItemId: 'f' })).toBeNull();
        });

        it('rethrows a non-404 failure', async () => {
            const error = new Error('boom');
            error.response = { status: 500 };
            graphRequest.mockRejectedValue(error);
            await expect(getFileById({ accessToken: 't', driveId: 'd', driveItemId: 'i' })).rejects.toThrow('boom');
        });
    });
});
