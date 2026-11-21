import releases, { type ReleaseData } from './releases.data.mts';

/** The landing page's release line: each version in brief, and where to read the rest. */
export type ReleaseLineData = Pick<ReleaseData, 'history' | 'changelogUrl' | 'pending' | 'pendingUrl'>;

/**
 * The part of the release data the landing page shows. The landing page is part of the theme, which
 * every page loads, so importing `releases.data.mts` there put every shown release's rendered notes,
 * about 500 kB, into the code of every page.
 */
async function load(): Promise<ReleaseLineData> {
    const { history, changelogUrl, pending, pendingUrl } = await releases.load();
    return { history, changelogUrl, pending, pendingUrl };
}

declare const data: ReleaseLineData;
export { data };

export default {
    watch: releases.watch,
    load
};
