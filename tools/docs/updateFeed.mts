/**
 * The site's address for the update feed. Servers read `https://jsprismarine.dev/updates/v1/`,
 * and the site redirects each file to the repository's `updates` release, where the release and
 * nightly workflows upload it. The files can move later by changing this redirect alone.
 */
import {
    DEFAULT_UPDATE_SOURCE,
    UPDATE_RELEASE_TAG,
    UPSTREAM_REPOSITORY
} from '../../packages/prismarine/src/updates/feed.ts';

/**
 * The `_redirects` rule for the feed: a 302, so a later move needs no cache to expire.
 * @returns The rule, one line with its newline.
 */
export const updateFeedRedirects = (): string => {
    const { pathname } = new URL(DEFAULT_UPDATE_SOURCE);
    return `${pathname}/* https://github.com/${UPSTREAM_REPOSITORY}/releases/download/${UPDATE_RELEASE_TAG}/:splat 302\n`;
};
