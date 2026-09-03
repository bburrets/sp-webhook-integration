jest.mock('../graph-request', () => ({ graphRequest: jest.fn() }));
jest.mock('../logger', () => ({
    createLogger: jest.fn(() => ({
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()
    }))
}));

const { graphRequest } = require('../graph-request');
const { checkCollision, renameFile } = require('../sharepoint-file-renamer');

const FILES = [
    { driveItemId: 'A', name: 'GLJE_FAM_202608_12345.pdf' },
    { driveItemId: 'B', name: 'scan_0417.pdf' },
    { driveItemId: 'C', name: 'WIRE_ACME_100_20260101.pdf' }
];

describe('sharepoint-file-renamer', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('checkCollision', () => {
        it('detects a name already held by another file', () => {
            const result = checkCollision({
                proposedName: 'GLJE_FAM_202608_12345.pdf',
                existingFiles: FILES,
                currentDriveItemId: 'B'
            });
            expect(result.collides).toBe(true);
            expect(result.conflictingFile.driveItemId).toBe('A');
        });

        it('does not treat the file\'s own name as a collision', () => {
            const result = checkCollision({
                proposedName: 'GLJE_FAM_202608_12345.pdf',
                existingFiles: FILES,
                currentDriveItemId: 'A'
            });
            expect(result.collides).toBe(false);
        });

        it('compares case-insensitively, as SharePoint does', () => {
            expect(checkCollision({
                proposedName: 'glje_fam_202608_12345.PDF',
                existingFiles: FILES,
                currentDriveItemId: 'B'
            }).collides).toBe(true);
        });

        it('reports no collision for a free name', () => {
            expect(checkCollision({
                proposedName: 'CHECK_ACME_1_20260101.pdf',
                existingFiles: FILES,
                currentDriveItemId: 'B'
            }).collides).toBe(false);
        });

        it('handles an empty or missing listing', () => {
            expect(checkCollision({ proposedName: 'x.pdf', existingFiles: [], currentDriveItemId: 'B' }).collides).toBe(false);
            expect(checkCollision({ proposedName: 'x.pdf', currentDriveItemId: 'B' }).collides).toBe(false);
        });
    });

    describe('renameFile', () => {
        const base = { accessToken: 't', driveId: 'd1', driveItemId: 'i1', newName: 'GLJE_FAM_202608_1.pdf' };

        it('requires driveId, driveItemId and newName', async () => {
            await expect(renameFile({ ...base, driveId: null })).rejects.toThrow(/driveId and driveItemId/);
            await expect(renameFile({ ...base, driveItemId: null })).rejects.toThrow(/driveId and driveItemId/);
            await expect(renameFile({ ...base, newName: null })).rejects.toThrow(/newName/);
        });

        it('defaults to dry run so a forgetful caller renames nothing', async () => {
            const result = await renameFile(base);
            expect(result).toMatchObject({ renamed: false, dryRun: true });
            expect(graphRequest).not.toHaveBeenCalled();
        });

        it('makes no Graph call in dry run', async () => {
            await renameFile({ ...base, dryRun: true });
            expect(graphRequest).not.toHaveBeenCalled();
        });

        it('PATCHes the driveItem name when live', async () => {
            graphRequest.mockResolvedValue({ data: {} });
            const result = await renameFile({ ...base, dryRun: false });

            expect(result).toMatchObject({ renamed: true, dryRun: false, collision: false });
            const call = graphRequest.mock.calls[0][0];
            expect(call.method).toBe('patch');
            expect(call.url).toContain('/drives/d1/items/i1');
            expect(call.data).toEqual({ name: 'GLJE_FAM_202608_1.pdf' });
        });

        it('sends no conflictBehavior, so Graph rejects rather than auto-suffixing', async () => {
            graphRequest.mockResolvedValue({ data: {} });
            await renameFile({ ...base, dryRun: false });
            expect(Object.keys(graphRequest.mock.calls[0][0].data)).toEqual(['name']);
        });

        it('reports a 409 as a collision rather than an error', async () => {
            const error = new Error('conflict');
            error.response = { status: 409, data: { error: { code: 'nameAlreadyExists' } } };
            graphRequest.mockRejectedValue(error);

            const result = await renameFile({ ...base, dryRun: false });
            expect(result).toMatchObject({ renamed: false, collision: true });
            expect(result.error).toMatch(/already exists/);
        });

        it('recognises nameAlreadyExists even on another status', async () => {
            const error = new Error('conflict');
            error.response = { status: 400, data: { error: { code: 'nameAlreadyExists' } } };
            graphRequest.mockRejectedValue(error);
            expect((await renameFile({ ...base, dryRun: false })).collision).toBe(true);
        });

        it('turns a 403 into an actionable permissions message', async () => {
            // The most likely deployment failure for this feature.
            const error = new Error('Forbidden');
            error.response = { status: 403 };
            graphRequest.mockRejectedValue(error);

            await expect(renameFile({ ...base, dryRun: false }))
                .rejects.toThrow(/lacks write permission.*Sites\.ReadWrite\.All/s);
        });

        it('rethrows any other failure for the queue to retry', async () => {
            const error = new Error('Graph down');
            error.response = { status: 500 };
            graphRequest.mockRejectedValue(error);
            await expect(renameFile({ ...base, dryRun: false })).rejects.toThrow('Graph down');
        });
    });
});
