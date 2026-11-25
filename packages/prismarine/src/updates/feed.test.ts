import { describe, expect, it } from 'vitest';

import {
    compareUpdateVersions,
    DEFAULT_UPDATE_SOURCE,
    defaultUpdateSourceOf,
    parseUpdateFeed,
    updateChannelFeeds,
    updateFeedUrl
} from './feed';
import { feedOf } from './feed.test-utils';

describe('compareUpdateVersions', () => {
    it('orders nightlies below their release and above the one before, by run', () => {
        const ordered = [
            '0.24.0',
            '0.25.0-nightly.20261122.4447',
            '0.25.0-nightly.20261124.4481',
            '0.25.0-nightly.20261124.4484',
            '0.25.0',
            '0.25.1',
            '0.26.0-unstable-20261125000000',
            '0.26.0',
            '1.0.0'
        ];
        const shuffled = [...ordered].reverse().sort(compareUpdateVersions);

        expect(shuffled).toEqual(ordered);
    });

    it('compares run numbers as numbers, not as text', () => {
        expect(compareUpdateVersions('0.25.0-nightly.20261124.10', '0.25.0-nightly.20261124.9')).toBeGreaterThan(0);
    });

    it('ignores build metadata and sorts text that is not a version below every version', () => {
        expect(compareUpdateVersions('0.25.0+abc', '0.25.0')).toBe(0);
        expect(compareUpdateVersions('not a version', '0.0.0')).toBeLessThan(0);
    });
});

describe('parseUpdateFeed', () => {
    it('reads a feed and drops keys it does not know', () => {
        const feed = parseUpdateFeed({ ...feedOf('0.25.0'), advisories: [] });

        expect(feed).toEqual(feedOf('0.25.0'));
        expect(feed).not.toHaveProperty('advisories');
    });

    it.each([
        ['another schema', { ...feedOf('0.25.0'), schema: 2 }],
        ['an unknown channel', { ...feedOf('0.25.0'), channel: 'beta' }],
        ['a version that is not semver', feedOf('v0.25')],
        ['a plain http release page', { ...feedOf('0.25.0'), url: 'http://example.com' }],
        ['an asset without a digest', { ...feedOf('0.25.0'), assets: { 'linux-x64': { url: 'https://a', size: 1 } } }],
        ['something that is not an object', 'release']
    ])('refuses %s', (_name, value) => {
        expect(parseUpdateFeed(value)).toBeUndefined();
    });
});

describe('updateFeedUrl', () => {
    it("reads a repository's feed from its updates release", () => {
        expect(updateFeedUrl('someone/fork', 'nightly')).toBe(
            'https://github.com/someone/fork/releases/download/updates/nightly.json'
        );
    });

    it('reads a folder URL, with or without its trailing slash', () => {
        expect(updateFeedUrl(DEFAULT_UPDATE_SOURCE, 'release')).toBe(
            'https://jsprismarine.dev/updates/v1/release.json'
        );
        expect(updateFeedUrl('https://example.com/feed/', 'release')).toBe('https://example.com/feed/release.json');
    });

    it('takes no plain http folder', () => {
        expect(updateFeedUrl('http://example.com/feed', 'release')).toBeUndefined();
    });
});

describe('channels and sources', () => {
    it('has a nightly server read the release feed too', () => {
        expect(updateChannelFeeds('nightly')).toEqual(['nightly', 'release']);
        expect(updateChannelFeeds('release')).toEqual(['release']);
    });

    it("points JSPrismarine's builds at the site and a fork's at the fork", () => {
        expect(defaultUpdateSourceOf('JSPrismarine/JSPrismarine')).toBe(DEFAULT_UPDATE_SOURCE);
        expect(defaultUpdateSourceOf('someone/fork')).toBe('someone/fork');
    });
});
