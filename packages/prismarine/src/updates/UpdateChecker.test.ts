import { afterEach, describe, expect, it } from 'vitest';

import { feedOf, feedServer } from './feed.test-utils';
import { UpdateChecker } from './UpdateChecker';

const RELEASE = 'https://example.com/feed/release.json';
const NIGHTLY = 'https://example.com/feed/nightly.json';

const servers: { close: () => Promise<void> }[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

const checkerOf = async (
    files: Record<string, unknown>,
    { current = '0.25.0', channel = 'release' as const }: { current?: string; channel?: 'release' | 'nightly' } = {}
) => {
    const server = await feedServer(files);
    servers.push(server);
    const warnings: string[] = [];
    const checker = new UpdateChecker({
        current,
        channel,
        source: 'https://example.com/feed',
        fetch: server.fetch,
        now: () => 1000,
        logger: { warn: (message) => warnings.push(message), debug: () => undefined }
    });
    return { checker, requests: server.requests, warnings };
};

describe('UpdateChecker', () => {
    it('finds a newer release once, and asks with the running version', async () => {
        const { checker, requests } = await checkerOf({ [RELEASE]: feedOf('0.26.0') });

        const first = await checker.check();
        const second = await checker.check();

        expect(first.found).toMatchObject({ version: '0.26.0', channel: 'release' });
        expect(second.found).toBeUndefined();
        expect(second.status).toMatchObject({ state: 'available', update: { version: '0.26.0' } });
        expect(requests).toEqual([
            { url: RELEASE, userAgent: 'JSPrismarine/0.25.0' },
            { url: RELEASE, userAgent: 'JSPrismarine/0.25.0' }
        ]);
    });

    it('is up to date when the feed names the running version', async () => {
        const { checker } = await checkerOf({ [RELEASE]: feedOf('0.25.0') });

        await expect(checker.check()).resolves.toEqual({
            status: { state: 'up-to-date', checkedAt: 1000, newest: '0.25.0' }
        });
        expect(checker.available()).toBeUndefined();
    });

    it('has a nightly hear about the release its nightly led up to', async () => {
        const { checker, requests } = await checkerOf(
            { [NIGHTLY]: feedOf('0.26.0-nightly.20261125.2', 'nightly'), [RELEASE]: feedOf('0.26.0') },
            { current: '0.26.0-nightly.20261125.1', channel: 'nightly' }
        );

        const { found } = await checker.check();

        expect(found).toMatchObject({ version: '0.26.0', channel: 'release' });
        expect(requests.map(({ url }) => url).sort()).toEqual([NIGHTLY, RELEASE]);
    });

    it('uses the feed that answered when the other did not', async () => {
        const { checker } = await checkerOf(
            { [NIGHTLY]: feedOf('0.26.0-nightly.20261125.2', 'nightly') },
            { current: '0.26.0-nightly.20261125.1', channel: 'nightly' }
        );

        await expect(checker.check()).resolves.toMatchObject({ found: { version: '0.26.0-nightly.20261125.2' } });
    });

    it('fails without a warning when the feed is not there, and keeps an update it found before', async () => {
        const files: Record<string, unknown> = { [RELEASE]: feedOf('0.26.0') };
        const { checker, warnings } = await checkerOf(files);
        await checker.check();
        delete files[RELEASE];

        const { status } = await checker.check();

        expect(status).toMatchObject({ state: 'failed', reason: `${RELEASE} answered 404` });
        expect(checker.available()).toMatchObject({ version: '0.26.0' });
        expect(warnings).toEqual([]);
    });

    it('warns once about a feed it cannot read', async () => {
        const { checker, warnings } = await checkerOf({ [RELEASE]: { schema: 99 } });

        await checker.check();
        await checker.check();

        expect(warnings).toEqual([`Update check: ${RELEASE} is not an update feed this server reads`]);
    });

    it('shares one request between checks that overlap', async () => {
        const { checker, requests } = await checkerOf({ [RELEASE]: feedOf('0.26.0') });

        const [first, second] = await Promise.all([checker.check(), checker.check()]);

        expect(requests).toHaveLength(1);
        expect(first).toBe(second);
    });
});
