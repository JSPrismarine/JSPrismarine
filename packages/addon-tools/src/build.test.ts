import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';
import { readZip } from '@jsprismarine/packs/zip';
import { afterEach, describe, expect, it } from 'vitest';

import { createAddonIndex, parseAddonIndex } from './addonIndex';
import { buildAddons, fetchPublishedIndex, releaseDownloadUrl } from './build';
import { copyHello, setHelloVersion, temporaryDirectory } from './fixture.test-utils';

const BASE_URL = releaseDownloadUrl('owner/repo');

describe('buildAddons', () => {
    it('writes each pack and an index whose entry names its URL and hash', async () => {
        const { addons } = await copyHello();
        await writeFile(path.join(addons, 'README.md'), '# Addons\n');
        const out = await temporaryDirectory();

        const result = await buildAddons({ addonsDirectory: addons, outDirectory: out, baseUrl: BASE_URL });

        expect((await readdir(out)).sort()).toEqual(['hello-1.2.3.mcpack', 'index.json']);
        const pack = await readFile(path.join(out, 'hello-1.2.3.mcpack'));
        const index = parseAddonIndex(JSON.parse(await readFile(path.join(out, 'index.json'), 'utf8')));
        expect(index).toEqual(result.index);
        expect(index.addons).toEqual([
            {
                name: 'hello',
                version: '1.2.3',
                description: 'Says hello.',
                minServer: '0.22.0',
                url: 'https://github.com/owner/repo/releases/download/addons/hello-1.2.3.mcpack',
                sha256: createHash('sha256').update(pack).digest('hex')
            }
        ]);
        expect([...readZip(pack).keys()]).toEqual(['README.md', 'addon.json', 'manifest.json', 'scripts/main.js']);
        expect(result.added).toEqual(index.addons);
    });

    it('adds nothing for a version already published with the same pack', async () => {
        const { addons } = await copyHello();
        const first = await buildAddons({
            addonsDirectory: addons,
            outDirectory: await temporaryDirectory(),
            baseUrl: BASE_URL
        });

        const again = await buildAddons({
            addonsDirectory: addons,
            outDirectory: await temporaryDirectory(),
            baseUrl: BASE_URL,
            published: first.index
        });

        expect(again.added).toEqual([]);
        expect(again.index).toEqual(first.index);
    });

    it('keeps the published versions beside a new one', async () => {
        const { addons, addon } = await copyHello();
        const first = await buildAddons({
            addonsDirectory: addons,
            outDirectory: await temporaryDirectory(),
            baseUrl: BASE_URL
        });
        await setHelloVersion(addon, [1, 3, 0]);

        const next = await buildAddons({
            addonsDirectory: addons,
            outDirectory: await temporaryDirectory(),
            baseUrl: BASE_URL,
            published: first.index
        });

        expect(next.index.addons.map((entry) => entry.version)).toEqual(['1.2.3', '1.3.0']);
        expect(next.added.map((entry) => entry.version)).toEqual(['1.3.0']);
    });

    it('refuses a changed addon whose version is already published', async () => {
        const { addons, addon } = await copyHello();
        const first = await buildAddons({
            addonsDirectory: addons,
            outDirectory: await temporaryDirectory(),
            baseUrl: BASE_URL
        });
        await writeFile(path.join(addon, 'scripts', 'main.js'), '// changed\n');

        await expect(
            buildAddons({
                addonsDirectory: addons,
                outDirectory: await temporaryDirectory(),
                baseUrl: BASE_URL,
                published: first.index
            })
        ).rejects.toBeInstanceOf(AddonToolsErrors.PublishedVersionChanged);
    });

    it('writes an index of the published versions when the folder has no addons', async () => {
        const published = createAddonIndex([]);
        const result = await buildAddons({
            addonsDirectory: await temporaryDirectory(),
            outDirectory: await temporaryDirectory(),
            baseUrl: BASE_URL,
            published
        });

        expect(result).toEqual({ index: published, built: [], added: [] });
    });

    it('refuses a base URL that is not https', async () => {
        await expect(
            buildAddons({
                addonsDirectory: await temporaryDirectory(),
                outDirectory: await temporaryDirectory(),
                baseUrl: 'http://example.com'
            })
        ).rejects.toBeInstanceOf(AddonToolsErrors.InvalidBaseUrl);
    });
});

describe('fetchPublishedIndex', () => {
    const servers: { close: () => void }[] = [];
    afterEach(() => {
        for (const server of servers.splice(0)) server.close();
    });

    /** Serves one response for every request, and gives the URL a release's files would sit under. */
    const serve = async (status: number, body: string): Promise<string> => {
        const server = createServer((_, response) => response.writeHead(status).end(body));
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        // listen() on a TCP port gives an AddressInfo.
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases/download/addons`;
    };

    it('reads the index the release serves', async () => {
        const index = createAddonIndex([]);

        expect(await fetchPublishedIndex(await serve(200, JSON.stringify(index)))).toEqual(index);
    });

    it('answers undefined when the release has no index yet', async () => {
        expect(await fetchPublishedIndex(await serve(404, 'Not Found'))).toBeUndefined();
    });

    it('refuses any other error', async () => {
        await expect(fetchPublishedIndex(await serve(500, ''))).rejects.toBeInstanceOf(
            AddonToolsErrors.PublishedIndexUnavailable
        );
    });

    it('downloads through the fetch it is given', async () => {
        const base = await serve(200, JSON.stringify(createAddonIndex([])));
        const requested: string[] = [];
        const fetcher: typeof fetch = (input, init) => {
            requested.push(String(input));
            return fetch(String(input).replace(BASE_URL, base), init);
        };

        expect(await fetchPublishedIndex(BASE_URL, fetcher)).toEqual(createAddonIndex([]));
        expect(requested).toEqual([`${BASE_URL}/index.json`]);
    });

    it('refuses an index that does not follow the schema', async () => {
        await expect(fetchPublishedIndex(await serve(200, '{"schemaVersion": 1}'))).rejects.toBeInstanceOf(
            AddonToolsErrors.InvalidAddonIndex
        );
    });
});
