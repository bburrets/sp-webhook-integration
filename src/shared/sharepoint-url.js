/**
 * SharePoint URL Parser
 * Turns a URL copied from the browser address bar into the pieces Graph needs.
 *
 * Asking an operator for a site path, a drive id and a drive-root-relative
 * folder path is a bad interface — those are not visible anywhere in SharePoint.
 * A URL is what people actually have, so that is what the configuration takes.
 *
 * Handles the forms SharePoint actually produces:
 *
 *   .../sites/Site/Library/Forms/AllItems.aspx
 *   .../sites/Site/Library/Forms/AllItems.aspx?id=%2Fsites%2FSite%2FLibrary%2FSub&viewid=...
 *   .../sites/Site/Library/Forms/AllItems.aspx?RootFolder=/sites/Site/Library/Sub
 *   .../sites/Site/Library
 *   .../sites/Site/Library/Sub/Folder
 *
 * The `id` / `RootFolder` query parameter wins when present: that is what the
 * address bar carries once you navigate into a subfolder, and the path segments
 * before it still point at the library root.
 */

// View pages that appear between the library and any folder path.
const VIEW_SEGMENTS = new Set(['forms']);
const VIEW_PAGE = /\.aspx$/i;

/**
 * Split a server-relative path into its segments, decoded.
 * @param {string} value
 * @returns {string[]}
 */
function pathSegments(value) {
    return String(value || '')
        .split('/')
        .map((segment) => {
            try {
                return decodeURIComponent(segment);
            } catch (error) {
                // A malformed escape should not sink the whole parse.
                return segment;
            }
        })
        .filter(Boolean);
}

/**
 * Parse a SharePoint library or folder URL.
 *
 * @param {string} url
 * @returns {{hostname: string, siteName: string, sitePath: string, libraryName: string, folderPath: string, isRoot: boolean}}
 * @throws {Error} If the URL is not a recognisable SharePoint library URL
 */
function parseSharePointUrl(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('A SharePoint URL is required');
    }

    let parsed;
    try {
        parsed = new URL(url.trim());
    } catch (error) {
        throw new Error(`Not a valid URL: ${url}`);
    }

    if (!/^https?:$/.test(parsed.protocol)) {
        throw new Error(`Not an http(s) URL: ${url}`);
    }

    const hostname = parsed.hostname;

    // Prefer the explicit folder pointer when the URL carries one.
    const explicit = parsed.searchParams.get('id') || parsed.searchParams.get('RootFolder');
    const segments = pathSegments(explicit || parsed.pathname);

    const sitesIndex = segments.findIndex((segment) => segment.toLowerCase() === 'sites');
    if (sitesIndex === -1 || !segments[sitesIndex + 1]) {
        throw new Error(
            `Could not find a /sites/{name} segment in the URL: ${url}. `
            + 'Copy the address bar URL from the document library.'
        );
    }

    const siteName = segments[sitesIndex + 1];
    let rest = segments.slice(sitesIndex + 2);

    // Drop the view page and its Forms/ container, which sit between the
    // library and any folder path.
    rest = rest.filter((segment, index) => {
        if (VIEW_PAGE.test(segment)) {
            return false;
        }
        // "Forms" only counts as a view container when a view page follows it.
        return !(VIEW_SEGMENTS.has(segment.toLowerCase())
            && rest.slice(index + 1).some((later) => VIEW_PAGE.test(later)));
    });

    if (rest.length === 0) {
        throw new Error(
            `The URL points at the site, not a document library: ${url}. `
            + 'Open the library and copy the URL from there.'
        );
    }

    const libraryName = rest[0];
    const folderPath = rest.slice(1).join('/');

    return {
        hostname,
        siteName,
        // The colon form the rest of this codebase uses for Graph site addressing.
        sitePath: `${hostname}:/sites/${siteName}:`,
        libraryName,
        folderPath,
        isRoot: folderPath.length === 0
    };
}

module.exports = {
    parseSharePointUrl,
    pathSegments
};
