import { describe, expect, it } from 'vitest';

import { DEFAULT_UPDATE_SOURCE, updateFeedUrl } from '../../packages/prismarine/src/updates/feed.ts';
import { updateFeedRedirects } from './updateFeed.mts';

/** Where Cloudflare Pages sends a path under a `from/* to/:splat` rule. */
const follow = (rule: string, url: string): string | undefined => {
    const [from = '', to = ''] = rule.trim().split(/\s+/);
    const prefix = from.replace(/\*$/, '');
    const { pathname } = new URL(url);
    return pathname.startsWith(prefix) ? to.replace(':splat', pathname.slice(prefix.length)) : undefined;
};

describe('updateFeedRedirects', () => {
    it("sends each feed file the server reads to the upstream repository's updates release", () => {
        const rule = updateFeedRedirects();

        expect(follow(rule, updateFeedUrl(DEFAULT_UPDATE_SOURCE, 'nightly')!)).toBe(
            updateFeedUrl('JSPrismarine/JSPrismarine', 'nightly')
        );
        expect(rule).toMatch(/ 302\n$/);
    });
});
