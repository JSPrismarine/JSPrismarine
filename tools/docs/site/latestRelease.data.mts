import releases, { type Release } from './releases.data.mts';

/** The newest release in full, for a page that shows it alone. */
export interface LatestReleaseData {
    latest: Release | undefined;
}

/**
 * The newest release, so that only the releases page imports every shown release's rendered notes.
 * A data loader two pages import becomes a chunk of its own, and that one is over 500 kB.
 */
async function load(): Promise<LatestReleaseData> {
    const { releases: shown } = await releases.load();
    return { latest: shown[0] };
}

declare const data: LatestReleaseData;
export { data };

export default {
    watch: releases.watch,
    load
};
