import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { chmod, cp, lstat, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AddonIndexEntry, AddonListing } from '@jsprismarine/addon-tools/addonIndex';
import { createAddonIndex, serializeAddonIndex } from '@jsprismarine/addon-tools/addonIndex';
import { releaseDownloadUrl } from '@jsprismarine/addon-tools/build';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';
import { writeZip } from '@jsprismarine/packs/zip';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { isRecord } from '../utils/isRecord';
import { AddonManager } from './AddonManager';
import { ADDONS_FILE, ADDONS_LOCK_FILE, DEFAULT_ADDON_SOURCE } from './addonFiles';
import { downloadPack, httpsFetch, writePackFolder } from './addonPack';

const encoder = new TextEncoder();

/** A pack's SHA-256 from Node's crypto, independent of the installer's own helper. */
const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Whether this process can write where permissions say it cannot, as root can. */
const ignoresPermissions = process.getuid?.() === 0;

/** A behavior pack's files: a manifest at `version`, an `addon.json` and a script. */
const packFiles = (
    version: string,
    options: { readonly minServer?: string; readonly extra?: Record<string, string>; readonly script?: string } = {}
): Map<string, Uint8Array> => {
    const [major, minor, patch] = version.split('.').map(Number);
    const files: Record<string, string> = {
        'addon.json': JSON.stringify({
            description: 'Does a thing.',
            minServer: options.minServer ?? '0.1.0',
            license: 'MIT'
        }),
        'manifest.json': JSON.stringify({
            format_version: 2,
            header: {
                name: 'Test addon',
                uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000001',
                version: [major, minor, patch],
                min_engine_version: [1, 21, 0]
            },
            modules: [
                {
                    type: 'script',
                    uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000002',
                    version: [major, minor, patch],
                    entry: 'scripts/main.js',
                    language: 'javascript'
                }
            ]
        }),
        'scripts/main.js': options.script ?? `// ${version}\n`,
        ...options.extra
    };
    return new Map(Object.entries(files).map(([name, text]) => [name, encoder.encode(text)]));
};

const pack = (version: string, options?: Parameters<typeof packFiles>[1]): Uint8Array =>
    writeZip(packFiles(version, options));

/** A resource pack's files, which an `.mcaddon` ships beside its behavior pack. */
const resourcePackFiles = (): Map<string, Uint8Array> =>
    new Map([
        [
            'manifest.json',
            encoder.encode(
                JSON.stringify({
                    format_version: 2,
                    header: {
                        name: 'Test resources',
                        uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000003',
                        version: [1, 0, 0],
                        min_engine_version: [1, 21, 0]
                    },
                    modules: [{ type: 'resources', uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000004', version: [1, 0, 0] }]
                })
            )
        ],
        ['textures/thing.png', new Uint8Array([1, 2, 3])]
    ]);

/** An `.mcaddon`: a behavior pack at `version` and a resource pack, each a nested `.mcpack`. */
const mcaddon = (version: string, options?: Parameters<typeof packFiles>[1]): Uint8Array =>
    writeZip(
        new Map([
            ['behavior.mcpack', pack(version, options)],
            ['resources.mcpack', writeZip(resourcePackFiles())]
        ])
    );

/** The files of a pack under a folder, as an `.mcaddon` may hold them. */
const inFolder = (folder: string, files: ReadonlyMap<string, Uint8Array>): [string, Uint8Array][] =>
    [...files].map(([name, data]) => [`${folder}/${name}`, data]);

/**
 * A local HTTP server standing in for GitHub, and the fetch that sends every request to it: an
 * `https://github.com/...` URL is served from the same path here.
 */
const fakeGitHub = async () => {
    const files = new Map<string, Uint8Array>();
    const redirects = new Map<string, string>();
    const requested: string[] = [];
    const server: HttpServer = createServer((request, response) => {
        const location = redirects.get(request.url ?? '');
        if (location !== undefined) {
            response.writeHead(302, { location }).end();
            return;
        }
        const body = files.get(request.url ?? '');
        if (body === undefined) response.writeHead(404).end('Not Found');
        else response.writeHead(200).end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address !== null && typeof address === 'object', 'listen() on a TCP port gives an AddressInfo');
    const local = `http://127.0.0.1:${address.port}`;
    const fetcher: typeof fetch = (input, init) => {
        const url = String(input);
        requested.push(url);
        return fetch(url.replace('https://github.com', local), init);
    };

    /** Publishes packs on a source's release, with the index listing them. */
    const publish = (
        source: string,
        addons: readonly {
            name: string;
            version: string;
            bytes: Uint8Array;
            minServer?: string;
            sha256?: string;
            deprecated?: string;
            replacedBy?: string;
        }[]
    ): AddonIndexEntry[] => {
        const base = releaseDownloadUrl(source);
        const entries = addons.map(({ name, version, bytes, minServer, sha256, deprecated, replacedBy }) => {
            const url = `${base}/${name}-${version}.mcpack`;
            files.set(new URL(url).pathname, bytes);
            const entry: AddonIndexEntry = {
                name,
                version,
                description: 'Does a thing.',
                minServer: minServer ?? '0.1.0',
                url,
                sha256: sha256 ?? sha256Of(bytes)
            };
            if (deprecated === undefined) return entry;
            const listing: AddonListing = {
                title: name,
                license: 'MIT',
                tags: [],
                authors: [],
                deprecated,
                ...(replacedBy === undefined ? {} : { replacedBy }),
                readme: { url: `${base}/${name}-${version}.md`, sha256: '0'.repeat(64) },
                screenshots: []
            };
            return { ...entry, listing };
        });
        files.set(
            new URL(`${base}/index.json`).pathname,
            encoder.encode(serializeAddonIndex(createAddonIndex(entries)))
        );
        return entries;
    };

    return {
        fetcher,
        publish,
        requested,
        /** Serves other bytes at a URL. */
        replace: (url: string, bytes: Uint8Array) => files.set(new URL(url).pathname, bytes),
        /** Answers a URL with a redirect to another. */
        redirect: (url: string, location: string) => redirects.set(new URL(url).pathname, location),
        close: () => new Promise<void>((resolve) => server.close(() => resolve()))
    };
};

describe('AddonManager', () => {
    let directory: string;
    let github: Awaited<ReturnType<typeof fakeGitHub>>;
    let logged: string[];
    let reloads: number;

    beforeEach(async () => {
        directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-addons-'));
        github = await fakeGitHub();
        logged = [];
        reloads = 0;
    });

    afterEach(async () => {
        await github.close();
        await rm(directory, { recursive: true, force: true });
    });

    const manager = (serverVersion = '0.22.0', reload?: () => void) =>
        new AddonManager({
            directory,
            serverVersion,
            fetch: github.fetcher,
            log: {
                info: (message) => logged.push(message),
                warn: (message) => logged.push(`warn: ${message}`),
                error: (message) => logged.push(`error: ${message}`)
            },
            reload: async () => {
                reloads++;
                reload?.();
            }
        });

    const readJson = async (file: string): Promise<unknown> =>
        JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    const exists = (...parts: string[]) =>
        stat(path.join(directory, ...parts)).then(
            () => true,
            () => false
        );
    /** The version of an installed addon's pack: its folder's, or a folder's inside it. */
    const installedVersion = async (key: string, folder = '.'): Promise<string> => {
        const manifest: unknown = JSON.parse(
            await readFile(path.join(directory, 'addons', key, folder, 'manifest.json'), 'utf8')
        );
        const version = isRecord(manifest) && isRecord(manifest.header) ? manifest.header.version : undefined;
        assert(Array.isArray(version), `${key}'s manifest has no header version`);
        return version.join('.');
    };

    it('installs the newest version from the default source, records both files and loads it', async () => {
        const [, newest] = github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'tps-bar', version: '1.1.0', bytes: pack('1.1.0') }
        ]);
        const addons = manager();

        await addons.install('tps-bar');

        expect(await installedVersion('tps-bar')).toBe('1.1.0');
        expect(await readJson(ADDONS_FILE)).toEqual({
            addons: { 'tps-bar': { source: DEFAULT_ADDON_SOURCE, version: '^1.1.0' } }
        });
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({
            lockfileVersion: 1,
            addons: {
                'tps-bar': {
                    source: DEFAULT_ADDON_SOURCE,
                    name: 'tps-bar',
                    version: '1.1.0',
                    url: newest!.url,
                    sha256: newest!.sha256
                }
            }
        });
        expect(addons.packDirectories()).toEqual([path.join(directory, 'addons', 'tps-bar')]);
        expect(addons.loadedAddons()).toEqual([{ name: 'tps-bar', version: '1.1.0' }]);
        expect(reloads).toBe(1);
        expect(logged).toContain(
            `Installed tps-bar 1.1.0 from ${DEFAULT_ADDON_SOURCE}, checked against its index's SHA-256`
        );
    });

    it('installs two sources’ addons of the same name side by side under different local names', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }]);
        github.publish('someone/their-addons', [{ name: 'tps-bar', version: '3.0.0', bytes: pack('3.0.0') }]);
        const addons = manager();

        await addons.install('tps-bar');
        await expect(addons.install('someone/their-addons/tps-bar')).rejects.toBeInstanceOf(
            PrismarineAddonErrors.AddonAlreadyInstalled
        );
        await addons.install('someone/their-addons/tps-bar', 'their-tps-bar');

        expect(await installedVersion('tps-bar')).toBe('1.0.0');
        expect(await installedVersion('their-tps-bar')).toBe('3.0.0');
        expect(await readJson(ADDONS_FILE)).toEqual({
            addons: {
                'their-tps-bar': { source: 'someone/their-addons', name: 'tps-bar', version: '^3.0.0' },
                'tps-bar': { source: DEFAULT_ADDON_SOURCE, version: '^1.0.0' }
            }
        });
    });

    it('refuses a pack whose download does not match the index’s hash, and writes nothing', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0'), sha256: 'f'.repeat(64) }
        ]);

        await expect(manager().install('tps-bar')).rejects.toBeInstanceOf(PrismarineAddonErrors.AddonHashMismatch);

        expect(await exists('addons', 'tps-bar')).toBe(false);
        expect(await exists(ADDONS_FILE)).toBe(false);
        expect(reloads).toBe(0);
    });

    it('refuses an addon too new for the server, and takes the newest version in range that fits', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'tps-bar', version: '1.1.0', bytes: pack('1.1.0'), minServer: '0.30.0' }
        ]);

        await expect(manager().install('tps-bar@1.1.0')).rejects.toBeInstanceOf(
            PrismarineAddonErrors.AddonNeedsNewerServer
        );
        await manager().install('tps-bar');

        expect(await installedVersion('tps-bar')).toBe('1.0.0');
    });

    it('refuses a pack whose own addon.json asks for a newer server', async () => {
        const file = path.join(directory, 'warps-1.0.0.mcpack');
        await writeFile(file, pack('1.0.0', { minServer: '9.0.0' }));

        await expect(manager().install(file)).rejects.toBeInstanceOf(PrismarineAddonErrors.AddonNeedsNewerServer);
    });

    it('moves a caret range on update, leaves an exact one, and nothing else moves a lock', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'warps', version: '2.0.0', bytes: pack('2.0.0') }
        ]);
        const addons = manager();
        await addons.install('tps-bar');
        await addons.install('warps@2.0.0');
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'tps-bar', version: '1.2.0', bytes: pack('1.2.0') },
            { name: 'tps-bar', version: '2.0.0', bytes: pack('2.0.0') },
            { name: 'warps', version: '2.0.0', bytes: pack('2.0.0') },
            { name: 'warps', version: '2.0.1', bytes: pack('2.0.1') }
        ]);

        expect(await addons.sync()).toEqual([]);
        expect(await installedVersion('tps-bar')).toBe('1.0.0');

        expect(await addons.update()).toEqual(['tps-bar']);
        expect(await installedVersion('tps-bar')).toBe('1.2.0');
        expect(await installedVersion('warps')).toBe('2.0.0');
        expect(await addons.update('warps')).toEqual([]);
        expect(logged).toContain('warps 2.0.0 is up to date');
    });

    it('warns that an install or update is deprecated, with its replacement, and locks why', async () => {
        github.publish('someone/packs', [
            {
                name: 'warps',
                version: '1.0.0',
                bytes: pack('1.0.0'),
                deprecated: 'Use warps-plus instead.',
                replacedBy: 'someone/packs/warps-plus'
            }
        ]);
        const addons = manager();

        await addons.install('someone/packs/warps');

        const warning =
            'warn: warps 1.0.0 is deprecated: "Use warps-plus instead." Install its replacement with addon install someone/packs/warps-plus.';
        expect(logged).toContain(warning);
        expect(await readJson(ADDONS_LOCK_FILE)).toMatchObject({
            addons: { warps: { deprecated: 'Use warps-plus instead.', replacedBy: 'someone/packs/warps-plus' } }
        });

        logged.length = 0;
        expect(await addons.update()).toEqual([]);
        expect(logged).toEqual(['warps 1.0.0 is up to date', warning]);
    });

    it('records a deprecation on update that a lock from an older server lacks, without reinstalling', async () => {
        // The version was published deprecated; a server from before listings locked it without the reason.
        const [entry] = github.publish('someone/packs', [
            { name: 'warps', version: '1.0.0', bytes: pack('1.0.0'), deprecated: 'No longer kept up.' }
        ]);
        const addons = manager();
        await addons.install('someone/packs/warps');
        const pinned = {
            source: 'someone/packs',
            name: 'warps',
            version: '1.0.0',
            url: entry!.url,
            sha256: entry!.sha256
        };
        await writeFile(
            path.join(directory, ADDONS_LOCK_FILE),
            JSON.stringify({ lockfileVersion: 1, addons: { warps: pinned } })
        );
        reloads = 0;
        logged.length = 0;

        expect(await addons.update()).toEqual([]);

        expect(reloads).toBe(0);
        expect(logged).toContain('warn: warps 1.0.0 is deprecated: "No longer kept up."');
        expect((await addons.list())[0]?.locked).toEqual({ ...pinned, deprecated: 'No longer kept up.' });
    });

    it('restores a locked addon whose folder is missing from its locked URL, without the index', async () => {
        const [entry] = github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        await manager().install('tps-bar');
        await rm(path.join(directory, 'addons'), { recursive: true });
        github.requested.length = 0;
        reloads = 0;

        const restored = manager();
        expect(await restored.sync({ reload: false })).toEqual([]);

        expect(await installedVersion('tps-bar')).toBe('1.0.0');
        expect(github.requested).toEqual([entry!.url]);
        expect(restored.packDirectories()).toEqual([path.join(directory, 'addons', 'tps-bar')]);
        expect(reloads).toBe(0);
    });

    it('refuses to restore a locked addon whose download no longer matches its lock', async () => {
        const [entry] = github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        await manager().install('tps-bar');
        const lock = await readJson(ADDONS_LOCK_FILE);
        await rm(path.join(directory, 'addons'), { recursive: true });
        github.replace(entry!.url, pack('1.0.0', { script: '// something else\n' }));

        const restored = manager();
        expect(await restored.sync()).toEqual(['tps-bar']);

        expect(await exists('addons', 'tps-bar')).toBe(false);
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual(lock);
        expect(restored.packDirectories()).toEqual([]);
        expect(
            logged.some(
                (line) => line.startsWith('error: Could not install tps-bar') && line.includes(ADDONS_LOCK_FILE)
            )
        ).toBe(true);
    });

    it('installs an addons.json entry that has no lock yet, and removes a locked addon it no longer names', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'warps', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        const addons = manager();
        await addons.install('tps-bar');
        await writeFile(
            path.join(directory, ADDONS_FILE),
            JSON.stringify({ addons: { warps: { source: DEFAULT_ADDON_SOURCE, version: '~1.0.0' } } })
        );

        expect(await addons.sync()).toEqual([]);

        expect(await exists('addons', 'tps-bar')).toBe(false);
        expect(await installedVersion('warps')).toBe('1.0.0');
        expect(addons.packDirectories()).toEqual([path.join(directory, 'addons', 'warps')]);
    });

    it('removes an addon from both files and its folder, and unloads it', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }]);
        const addons = manager();
        await addons.install('tps-bar');

        await addons.remove('tps-bar');

        expect(await exists('addons', 'tps-bar')).toBe(false);
        expect(await readJson(ADDONS_FILE)).toEqual({ addons: {} });
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({ lockfileVersion: 1, addons: {} });
        expect(addons.packDirectories()).toEqual([]);
        expect(reloads).toBe(2);
        await expect(addons.remove('tps-bar')).rejects.toBeInstanceOf(PrismarineAddonErrors.AddonNotInstalled);
    });

    it('links a folder on disk, so an edit to it shows in the installed addon', async () => {
        const source = path.join(directory, 'src', 'my-addon');
        for (const [name, data] of packFiles('0.1.0')) {
            await mkdir(path.dirname(path.join(source, name)), { recursive: true });
            await writeFile(path.join(source, name), data);
        }
        const addons = manager();

        await addons.install('./src/my-addon');
        await writeFile(path.join(source, 'scripts', 'main.js'), '// edited\n');

        expect(await readFile(path.join(directory, 'addons', 'my-addon', 'scripts', 'main.js'), 'utf8')).toBe(
            '// edited\n'
        );
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({
            lockfileVersion: 1,
            addons: { 'my-addon': { path: path.join('src', 'my-addon'), name: 'my-addon', version: '0.1.0' } }
        });

        await addons.remove('my-addon');
        expect(await exists('src', 'my-addon', 'manifest.json')).toBe(true);
    });

    it('unpacks an .mcpack on disk and locks its hash', async () => {
        const bytes = pack('2.0.0');
        await writeFile(path.join(directory, 'warps-2.0.0.mcpack'), bytes);

        await manager().install('./warps-2.0.0.mcpack');

        expect(await installedVersion('warps')).toBe('2.0.0');
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({
            lockfileVersion: 1,
            addons: {
                warps: {
                    path: 'warps-2.0.0.mcpack',
                    name: 'warps',
                    version: '2.0.0',
                    sha256: sha256Of(bytes),
                    packs: [
                        {
                            folder: '.',
                            type: 'behavior',
                            uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000001',
                            version: '2.0.0'
                        }
                    ]
                }
            }
        });
    });

    it('installs a pack from a URL, says no index vouches for it, and locks the hash it downloaded', async () => {
        const url = 'https://github.com/someone/packs/releases/download/v1/warps.mcpack';
        const bytes = pack('1.0.0');
        github.replace(url, bytes);

        await manager().install(url);

        expect(await installedVersion('warps')).toBe('1.0.0');
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({
            lockfileVersion: 1,
            addons: {
                warps: {
                    url,
                    name: 'warps',
                    version: '1.0.0',
                    sha256: sha256Of(bytes),
                    packs: [
                        {
                            folder: '.',
                            type: 'behavior',
                            uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000001',
                            version: '1.0.0'
                        }
                    ]
                }
            }
        });
        expect(logged.some((line) => line.includes('no index vouches for'))).toBe(true);
    });

    it('says a pack with more than scripts needs a restart for the rest', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            {
                name: 'mobs',
                version: '1.0.0',
                bytes: pack('1.0.0', { extra: { 'entities/cow.json': '{}', 'items/stick.json': '{}' } })
            }
        ]);

        await manager().install('mobs');

        expect(logged).toContain('mobs also has entities, items, which load when the server restarts');
    });

    it('installs every pack of an .mcaddon, each in a folder of its own', async () => {
        await writeFile(path.join(directory, 'furniture.mcaddon'), mcaddon('1.2.0'));
        const addons = manager();

        const locked = await addons.install('./furniture.mcaddon');

        expect(locked).toMatchObject({
            version: '1.2.0',
            packs: [
                {
                    folder: 'behavior',
                    type: 'behavior',
                    uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000001',
                    version: '1.2.0'
                },
                {
                    folder: 'resources',
                    type: 'resource',
                    uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000003',
                    version: '1.0.0'
                }
            ]
        });
        expect(await exists('addons', 'furniture', 'behavior', 'scripts', 'main.js')).toBe(true);
        expect(await exists('addons', 'furniture', 'resources', 'textures', 'thing.png')).toBe(true);
        expect(addons.packDirectories()).toEqual([path.join(directory, 'addons', 'furniture', 'behavior')]);
        expect(addons.resourcePacks().map(({ key, directory: at }) => [key, at])).toEqual([
            ['furniture', path.join(directory, 'addons', 'furniture', 'resources')]
        ]);
        expect(logged).toContain('furniture holds behavior pack Test addon 1.2.0, resource pack Test resources 1.0.0');
        expect(logged).toContain("furniture's resource packs reach each player when they next join");
        // The same list until the installed packs change, so the server zips them once.
        expect(addons.resourcePacks()).toBe(addons.resourcePacks());
        expect((await addons.list())[0]!.packs.map(({ folder }) => folder)).toEqual(['behavior', 'resources']);
    });

    it('reads an .mcaddon whose packs are folders rather than nested .mcpacks', async () => {
        await writeFile(
            path.join(directory, 'furniture.mcaddon'),
            writeZip(new Map([...inFolder('BP', packFiles('1.0.0')), ...inFolder('RP', resourcePackFiles())]))
        );
        const addons = manager();

        await addons.install('./furniture.mcaddon');

        expect(addons.packDirectories()).toEqual([path.join(directory, 'addons', 'furniture', 'bp')]);
        expect(addons.resourcePacks().map(({ folder }) => folder)).toEqual(['rp']);
    });

    it('installs an .mcaddon with two behavior packs, and an .mcpack that is a resource pack', async () => {
        await writeFile(
            path.join(directory, 'two.mcaddon'),
            writeZip(new Map([...inFolder('a', packFiles('1.0.0')), ...inFolder('b', packFiles('1.1.0'))]))
        );
        await writeFile(path.join(directory, 'looks.mcpack'), writeZip(resourcePackFiles()));
        const addons = manager();

        await addons.install('./two.mcaddon');
        const looks = await addons.install('./looks.mcpack');

        expect(addons.packDirectories()).toEqual([
            path.join(directory, 'addons', 'two', 'a'),
            path.join(directory, 'addons', 'two', 'b')
        ]);
        expect(looks).toMatchObject({ version: '1.0.0', packs: [{ folder: '.', type: 'resource' }] });
        expect(addons.resourcePacks().map(({ key, folder }) => [key, folder])).toEqual([['looks', '.']]);
    });

    it('skips a skin pack, and refuses an archive that holds nothing to install', async () => {
        const skins = writeZip(
            new Map([
                [
                    'manifest.json',
                    encoder.encode(
                        JSON.stringify({
                            format_version: 1,
                            header: { name: 'Skins', uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000005', version: [1, 0, 0] },
                            modules: [
                                { type: 'skin_pack', uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000006', version: [1, 0, 0] }
                            ]
                        })
                    )
                ]
            ])
        );
        await writeFile(
            path.join(directory, 'with-skins.mcaddon'),
            writeZip(
                new Map([
                    ['behavior.mcpack', pack('1.0.0')],
                    ['skins.mcpack', skins]
                ])
            )
        );
        await writeFile(
            path.join(directory, 'none.mcaddon'),
            writeZip(new Map([['readme.txt', encoder.encode('hi')]]))
        );
        const addons = manager();

        await addons.install('./with-skins.mcaddon');
        await expect(addons.install('./none.mcaddon')).rejects.toBeInstanceOf(PrismarineAddonErrors.InvalidAddonPack);

        expect(logged).toContain(
            'warn: with-skins also holds skins.mcpack, which the server does not install: it is a skin pack, which players import themselves'
        );
        expect(await exists('addons', 'none')).toBe(false);
    });

    it('refuses a Minecraft Editor project', async () => {
        await writeFile(path.join(directory, 'castle.mcproject'), writeZip(new Map([['level.dat', new Uint8Array()]])));

        await expect(manager().install('./castle.mcproject')).rejects.toThrow(/Minecraft Editor project/);
        expect(await exists('addons', 'castle')).toBe(false);
    });

    it('warns of a pack an addon needs that no installed addon holds', async () => {
        const manifest = JSON.parse(new TextDecoder().decode(packFiles('1.0.0').get('manifest.json')));
        manifest.dependencies = [{ uuid: '8c2b3c4e-0d1a-4c8e-9f00-0000000000ff', version: [1, 0, 0] }];
        const files = packFiles('1.0.0');
        files.set('manifest.json', encoder.encode(JSON.stringify(manifest)));
        await writeFile(path.join(directory, 'needy.mcpack'), writeZip(files));

        await manager().install('./needy.mcpack');

        expect(logged).toContain(
            "warn: needy's behavior pack Test addon needs the pack 8c2b3c4e-0d1a-4c8e-9f00-0000000000ff 1.0.0, which no installed addon holds"
        );
    });

    it('imports the worlds of an archive once, and installs the packs a world turns on', async () => {
        const world = writeZip(
            new Map([
                ['level.dat', new Uint8Array([1])],
                ['db/CURRENT', encoder.encode('MANIFEST-000001')],
                [
                    'world_resource_packs.json',
                    encoder.encode(
                        JSON.stringify([{ pack_id: '8c2b3c4e-0d1a-4c8e-9f00-000000000003', version: [1, 0, 0] }])
                    )
                ],
                ...inFolder('resource_packs/rp', resourcePackFiles()),
                ...inFolder('resource_packs/off', new Map([['manifest.json', encoder.encode('{}')]]))
            ])
        );
        const file = path.join(directory, 'addons', 'adventure.mcaddon');
        await mkdir(path.dirname(file));
        await writeFile(file, writeZip(new Map([['map.mcworld', world]])));
        const imported: string[] = [];
        const addons = new AddonManager({
            directory,
            serverVersion: '0.22.0',
            fetch: github.fetcher,
            log: {
                info: (line) => logged.push(line),
                warn: (line) => logged.push(`warn: ${line}`),
                error: (line) => logged.push(`error: ${line}`)
            },
            importWorld: async ({ key, member, template, files }) => {
                imported.push(`${key} ${member} ${template} ${[...files.keys()].includes('db/CURRENT')}`);
                return { id: '00000000-0000-4000-8000-000000000001', name: 'adventure' };
            }
        });

        expect(await addons.sync()).toEqual([]);
        await rm(path.join(directory, 'addons', 'adventure'), { recursive: true });
        expect(await addons.sync()).toEqual([]);

        expect(imported).toEqual(['adventure map.mcworld false true']);
        expect(addons.resourcePacks().map(({ folder }) => folder)).toEqual(['rp']);
        expect(await readJson(ADDONS_LOCK_FILE)).toMatchObject({
            addons: {
                adventure: {
                    version: '1.0.0',
                    worlds: [{ member: 'map.mcworld', level: '00000000-0000-4000-8000-000000000001' }]
                }
            }
        });
        expect(logged).toContain(
            "Imported adventure's map.mcworld as the level adventure (00000000-0000-4000-8000-000000000001); world attach adventure puts it in play"
        );
    });

    it('installs an .mcaddon a lock from before archives held several packs names again, for the rest of its packs', async () => {
        const bytes = mcaddon('1.0.0');
        const file = path.join(directory, 'addons', 'furniture.mcaddon');
        await mkdir(path.join(directory, 'addons', 'furniture'), { recursive: true });
        await writeFile(file, bytes);
        for (const [name, data] of packFiles('1.0.0')) {
            await mkdir(path.dirname(path.join(directory, 'addons', 'furniture', name)), { recursive: true });
            await writeFile(path.join(directory, 'addons', 'furniture', name), data);
        }
        const relative = path.join('addons', 'furniture.mcaddon');
        await writeFile(
            path.join(directory, ADDONS_FILE),
            JSON.stringify({ addons: { furniture: { path: relative } } })
        );
        await writeFile(
            path.join(directory, ADDONS_LOCK_FILE),
            JSON.stringify({
                lockfileVersion: 1,
                addons: { furniture: { path: relative, name: 'furniture', version: '1.0.0', sha256: sha256Of(bytes) } }
            })
        );
        const addons = manager();

        expect(await addons.sync()).toEqual([]);

        expect(addons.resourcePacks().map(({ folder }) => folder)).toEqual(['resources']);
        expect(await exists('addons', 'furniture', 'manifest.json')).toBe(false);
    });

    /** Writes both files with one lock an older server wrote, which lists no packs. */
    const legacyLock = async (request: Record<string, string>, lock: Record<string, string>) => {
        await writeFile(path.join(directory, ADDONS_FILE), JSON.stringify({ addons: { furniture: request } }));
        await writeFile(
            path.join(directory, ADDONS_LOCK_FILE),
            JSON.stringify({
                lockfileVersion: 1,
                addons: { furniture: { name: 'furniture', version: '1.0.0', ...lock } }
            })
        );
        for (const [name, data] of packFiles('1.0.0')) {
            await mkdir(path.dirname(path.join(directory, 'addons', 'furniture', name)), { recursive: true });
            await writeFile(path.join(directory, 'addons', 'furniture', name), data);
        }
    };

    it('installs a URL .mcaddon an older lock names again, from the bytes its hash pins', async () => {
        const url = 'https://github.com/someone/packs/releases/download/v1/furniture.mcaddon';
        const bytes = mcaddon('1.0.0');
        github.replace(url, bytes);
        await legacyLock({ url }, { url, sha256: sha256Of(bytes) });
        const addons = manager();

        expect(await addons.sync()).toEqual([]);
        expect(addons.resourcePacks().map(({ folder }) => folder)).toEqual(['resources']);

        // A URL that serves other bytes now is refused rather than installed under the old lock.
        await rm(path.join(directory, 'addons', 'furniture'), { recursive: true });
        await legacyLock({ url }, { url, sha256: sha256Of(bytes) });
        github.replace(url, mcaddon('1.1.0'));
        expect(await addons.sync()).toEqual(['furniture']);
        expect(logged.some((line) => line.startsWith('error: Could not install furniture'))).toBe(true);
    });

    it('refuses to reinstall an older lock of an archive at a path whose file changed since', async () => {
        const file = path.join(directory, 'packs', 'furniture.mcaddon');
        await mkdir(path.dirname(file), { recursive: true });
        const bytes = mcaddon('1.0.0');
        await writeFile(file, mcaddon('1.1.0'));
        const stored = path.join('packs', 'furniture.mcaddon');
        await legacyLock({ path: stored }, { path: stored, sha256: sha256Of(bytes) });

        expect(await manager().sync()).toEqual(['furniture']);
        expect(logged.some((line) => line.includes('SHA-256') || line.includes('sha256'))).toBe(true);
    });

    it('locks the worlds that imported when a later world of the archive fails', async () => {
        const world = writeZip(new Map([['level.dat', new Uint8Array([1])]]));
        const file = path.join(directory, 'addons', 'maps.mcaddon');
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(
            file,
            writeZip(
                new Map([
                    ['a.mcworld', world],
                    ['b.mcworld', world]
                ])
            )
        );
        const imported: string[] = [];
        let failB = true;
        const addons = new AddonManager({
            directory,
            serverVersion: '0.22.0',
            fetch: github.fetcher,
            log: {
                info: (line) => logged.push(line),
                warn: (line) => logged.push(`warn: ${line}`),
                error: (line) => logged.push(`error: ${line}`)
            },
            importWorld: async ({ member }) => {
                if (member === 'b.mcworld' && failB) throw new TypeError('disk full');
                imported.push(member);
                return { id: `00000000-0000-4000-8000-00000000000${imported.length}`, name: member };
            }
        });

        expect(await addons.sync()).toEqual([]);
        expect(await readJson(ADDONS_LOCK_FILE)).toMatchObject({
            addons: { maps: { worlds: [{ member: 'a.mcworld', level: '00000000-0000-4000-8000-000000000001' }] } }
        });
        expect(logged).toContain(
            "error: Could not import maps's b.mcworld: disk full; delete addons/maps and run addon sync to try again"
        );

        failB = false;
        await rm(path.join(directory, 'addons', 'maps'), { recursive: true });
        expect(await addons.sync()).toEqual([]);
        expect(imported).toEqual(['a.mcworld', 'b.mcworld']);
    });

    it('creates the addons folder on sync though no addon is installed', async () => {
        await manager().sync({ reload: false });

        expect((await stat(path.join(directory, 'addons'))).isDirectory()).toBe(true);
    });

    it('installs an .mcaddon dropped into the addons folder, under a key made from its name', async () => {
        const bytes = mcaddon('1.0.0');
        await mkdir(path.join(directory, 'addons'));
        await writeFile(path.join(directory, 'addons', 'Furniture_Pack v2.mcaddon'), bytes);
        const addons = manager();

        expect(await addons.sync()).toEqual([]);

        expect(await installedVersion('furniture-pack-v2', 'behavior')).toBe('1.0.0');
        expect(await readJson(ADDONS_FILE)).toEqual({
            addons: { 'furniture-pack-v2': { path: path.join('addons', 'Furniture_Pack v2.mcaddon') } }
        });
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({
            lockfileVersion: 1,
            addons: {
                'furniture-pack-v2': {
                    path: path.join('addons', 'Furniture_Pack v2.mcaddon'),
                    name: 'furniture-pack-v2',
                    version: '1.0.0',
                    sha256: sha256Of(bytes),
                    packs: [
                        {
                            folder: 'behavior',
                            type: 'behavior',
                            uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000001',
                            version: '1.0.0'
                        },
                        {
                            folder: 'resources',
                            type: 'resource',
                            uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000003',
                            version: '1.0.0'
                        }
                    ]
                }
            }
        });
        expect(addons.packDirectories()).toEqual([path.join(directory, 'addons', 'furniture-pack-v2', 'behavior')]);
        expect(reloads).toBe(1);

        // A second sync finds the file it already installed and changes nothing.
        await addons.sync();
        expect(reloads).toBe(1);
    });

    it('says nothing waits for a restart when it installs a dropped pack as the server starts', async () => {
        const extra = { 'blocks/light.json': '{}' };
        await mkdir(path.join(directory, 'addons'));
        await writeFile(path.join(directory, 'addons', 'lights.mcaddon'), mcaddon('1.0.0', { extra }));

        // The startup sync runs before the content build, which loads the blocks with the rest.
        await manager().sync({ reload: false });
        expect(logged.some((line) => line.includes('load when the server restarts'))).toBe(false);

        // Dropped while the server runs, the blocks wait for the next restart.
        await writeFile(path.join(directory, 'addons', 'more-lights.mcaddon'), mcaddon('1.0.0', { extra }));
        await manager().sync();
        expect(logged).toContain('more-lights also has behavior/blocks, which load when the server restarts');
    });

    it('installs a dropped pack again when its file is replaced, and removes it when the file is gone', async () => {
        const file = path.join(directory, 'addons', 'warps.mcaddon');
        await mkdir(path.dirname(file));
        await writeFile(file, mcaddon('1.0.0'));
        const addons = manager();
        await addons.sync();

        await writeFile(file, mcaddon('1.1.0'));
        expect(await addons.sync()).toEqual([]);
        expect(await installedVersion('warps', 'behavior')).toBe('1.1.0');
        expect(logged).toContain(`Updated 1.0.0 to warps 1.1.0 from ${path.join('addons', 'warps.mcaddon')}`);

        await rm(file);
        expect(await addons.sync()).toEqual([]);
        expect(await exists('addons', 'warps')).toBe(false);
        expect(await readJson(ADDONS_FILE)).toEqual({ addons: {} });
        expect(await readJson(ADDONS_LOCK_FILE)).toEqual({ lockfileVersion: 1, addons: {} });
        expect(addons.packDirectories()).toEqual([]);
    });

    it('deletes a dropped pack’s file on remove, so the next sync does not install it again', async () => {
        await mkdir(path.join(directory, 'addons'));
        await writeFile(path.join(directory, 'addons', 'warps.mcpack'), pack('1.0.0'));
        const addons = manager();
        await addons.sync();

        await addons.remove('warps');
        await addons.sync();

        expect(await exists('addons', 'warps.mcpack')).toBe(false);
        expect(await exists('addons', 'warps')).toBe(false);
        expect(await readJson(ADDONS_FILE)).toEqual({ addons: {} });
    });

    it('leaves a dropped pack whose key another addon holds, and says to rename it', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'warps', version: '1.0.0', bytes: pack('1.0.0') }]);
        const addons = manager();
        await addons.install('warps');
        await writeFile(path.join(directory, 'addons', 'warps.mcaddon'), mcaddon('2.0.0'));

        await addons.sync();

        expect(await installedVersion('warps')).toBe('1.0.0');
        expect(logged).toContain(
            'warn: addons/warps.mcaddon would install as warps, which is already installed; rename the file'
        );
    });

    it('reloads the scripts on a sync that asks for it, restarting them only when an addon changed', async () => {
        const restarts: boolean[] = [];
        const addons = new AddonManager({
            directory,
            serverVersion: '0.22.0',
            fetch: github.fetcher,
            log: { info: () => {}, warn: () => {}, error: () => {} },
            reload: async ({ restart }) => {
                restarts.push(restart);
            }
        });

        await addons.sync({ reload: 'always' });
        await mkdir(path.join(directory, 'addons'), { recursive: true });
        await writeFile(path.join(directory, 'addons', 'warps.mcpack'), pack('1.0.0'));
        await addons.sync({ reload: 'always' });

        expect(restarts).toEqual([false, true]);
    });

    it('refuses a pack that would write outside its folder', async () => {
        const url = 'https://github.com/someone/packs/releases/download/v1/evil.mcpack';
        github.replace(url, writeZip(new Map([...packFiles('1.0.0'), ['../escape.js', encoder.encode('')]])));

        await expect(manager().install(url)).rejects.toBeInstanceOf(PrismarineAddonErrors.InvalidAddonPack);
        expect(await exists('escape.js')).toBe(false);
    });

    it('runs one operation at a time, in the order they were asked for', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'warps', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        const addons = manager();

        await Promise.all([addons.install('tps-bar'), addons.install('warps')]);

        expect(await readJson(ADDONS_FILE)).toEqual({
            addons: { 'tps-bar': expect.anything(), warps: expect.anything() }
        });
        expect(github.requested.filter((url) => url.endsWith('.mcpack'))).toEqual([
            `${releaseDownloadUrl(DEFAULT_ADDON_SOURCE)}/tps-bar-1.0.0.mcpack`,
            `${releaseDownloadUrl(DEFAULT_ADDON_SOURCE)}/warps-1.0.0.mcpack`
        ]);
    });

    it('reads a key such as constructor as an addon only when a file names it', async () => {
        await mkdir(path.join(directory, 'addons', 'constructor'), { recursive: true });

        await expect(manager().remove('constructor')).rejects.toBeInstanceOf(PrismarineAddonErrors.AddonNotInstalled);
        expect(await exists('addons', 'constructor')).toBe(true);
    });

    it('locks and loads the addons an update replaced before one that failed', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'warps', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        const addons = manager();
        await addons.install('tps-bar');
        await addons.install('warps');
        reloads = 0;
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.1.0', bytes: pack('1.1.0') },
            { name: 'warps', version: '1.1.0', bytes: pack('1.1.0'), sha256: 'f'.repeat(64) }
        ]);

        await expect(addons.update()).rejects.toBeInstanceOf(PrismarineAddonErrors.AddonHashMismatch);

        expect(await installedVersion('tps-bar')).toBe('1.1.0');
        expect(await readJson(ADDONS_LOCK_FILE)).toMatchObject({
            addons: { 'tps-bar': { version: '1.1.0' }, warps: { version: '1.0.0' } }
        });
        expect(reloads).toBe(1);
    });

    it('warns that an update leaves the old version’s restart-only content loaded', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'mobs', version: '1.0.0', bytes: pack('1.0.0', { extra: { 'entities/cow.json': '{}' } }) }
        ]);
        const addons = manager();
        await addons.install('mobs');
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'mobs', version: '1.1.0', bytes: pack('1.1.0') }]);

        await addons.update();

        expect(logged).toContain("mobs's old version had entities, which stay loaded until the server restarts");
    });

    it.skipIf(ignoresPermissions)(
        'keeps an addon whose folder could not be deleted, so remove runs again',
        async () => {
            github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }]);
            const addons = manager();
            await addons.install('tps-bar');
            const lock = await readJson(ADDONS_LOCK_FILE);
            await chmod(path.join(directory, 'addons'), 0o555);

            try {
                await expect(addons.remove('tps-bar')).rejects.toThrow();
                expect(await readJson(ADDONS_LOCK_FILE)).toEqual(lock);
            } finally {
                await chmod(path.join(directory, 'addons'), 0o755);
            }
            await addons.remove('tps-bar');

            expect(await exists('addons', 'tps-bar')).toBe(false);
        }
    );

    it.skipIf(ignoresPermissions)('starts without an addon it could not remove, and keeps its lock', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'warps', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        await manager().install('tps-bar');
        await manager().install('warps');
        await writeFile(
            path.join(directory, ADDONS_FILE),
            JSON.stringify({ addons: { warps: { source: DEFAULT_ADDON_SOURCE, version: '^1.0.0' } } })
        );
        await chmod(path.join(directory, 'addons'), 0o555);

        const restarted = manager();
        try {
            expect(await restarted.sync({ reload: false })).toEqual(['tps-bar']);
        } finally {
            await chmod(path.join(directory, 'addons'), 0o755);
        }

        expect(restarted.packDirectories()).toEqual([path.join(directory, 'addons', 'warps')]);
        expect(await readJson(ADDONS_LOCK_FILE)).toMatchObject({ addons: { 'tps-bar': { version: '1.0.0' } } });
    });

    it('reloads on the next sync after a reload failed, and not again once one finished', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }]);
        let failing = true;
        const addons = manager(undefined, () => {
            if (failing) throw new TypeError('bad manifest');
        });

        await expect(addons.install('tps-bar')).rejects.toThrow('bad manifest');
        expect(await installedVersion('tps-bar')).toBe('1.0.0');
        await expect(addons.sync()).rejects.toThrow('bad manifest');
        expect(reloads).toBe(2);

        failing = false;
        expect(await addons.sync()).toEqual([]);
        expect(reloads).toBe(3);
        await addons.sync();
        expect(reloads).toBe(3);
    });

    it.skipIf(ignoresPermissions)('locks and loads an update whose old folder could not be deleted', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }]);
        const addons = manager();
        await addons.install('tps-bar');
        reloads = 0;
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'tps-bar', version: '1.1.0', bytes: pack('1.1.0') }
        ]);
        const previous = path.join(directory, 'addons', '.tps-bar.previous');
        // A folder the server cannot write keeps its files, so the old version cannot be deleted
        // once it has moved aside.
        await chmod(path.join(directory, 'addons', 'tps-bar', 'scripts'), 0o555);

        try {
            expect(await addons.update()).toEqual(['tps-bar']);
        } finally {
            await chmod(path.join(previous, 'scripts'), 0o755);
        }

        expect(await installedVersion('tps-bar')).toBe('1.1.0');
        expect(await readJson(ADDONS_LOCK_FILE)).toMatchObject({ addons: { 'tps-bar': { version: '1.1.0' } } });
        expect(reloads).toBe(1);
        expect(logged.some((line) => line.startsWith(`warn: tps-bar's old version stays in ${previous}`))).toBe(true);
    });

    it('leaves an addon that failed to sync out of the pack list when another one installs', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') },
            { name: 'tps-bar', version: '2.0.0', bytes: pack('2.0.0'), sha256: 'f'.repeat(64) },
            { name: 'warps', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        const addons = manager();
        await addons.install('tps-bar@^1.0.0');
        await writeFile(
            path.join(directory, ADDONS_FILE),
            JSON.stringify({
                addons: {
                    'tps-bar': { source: DEFAULT_ADDON_SOURCE, version: '^2.0.0' },
                    warps: { source: DEFAULT_ADDON_SOURCE, version: '^1.0.0' }
                }
            })
        );

        expect(await addons.sync()).toEqual(['tps-bar']);

        expect(addons.packDirectories()).toEqual([path.join(directory, 'addons', 'warps')]);
    });

    it('reloads when an addon leaves the pack list though no folder changed', async () => {
        const [entry] = github.publish(DEFAULT_ADDON_SOURCE, [
            { name: 'tps-bar', version: '1.0.0', bytes: pack('1.0.0') }
        ]);
        const addons = manager();
        await addons.install('tps-bar');
        await rm(path.join(directory, 'addons', 'tps-bar'), { recursive: true });
        github.replace(entry!.url, pack('1.0.0', { script: '// something else\n' }));
        reloads = 0;

        expect(await addons.sync()).toEqual(['tps-bar']);

        expect(addons.packDirectories()).toEqual([]);
        expect(addons.loadedAddons()).toEqual([]);
        expect(reloads).toBe(1);
    });

    it('refuses a pack whose manifest is another version than the index lists, though its hash matches', async () => {
        github.publish(DEFAULT_ADDON_SOURCE, [{ name: 'tps-bar', version: '2.0.0', bytes: pack('1.0.0') }]);

        await expect(manager().install('tps-bar')).rejects.toBeInstanceOf(PrismarineAddonErrors.AddonVersionDiffers);
        expect(await exists('addons', 'tps-bar')).toBe(false);
    });

    it('refuses a folder where the locked .mcpack was', async () => {
        const file = path.join(directory, 'warps-2.0.0.mcpack');
        await writeFile(file, pack('2.0.0'));
        const addons = manager();
        await addons.install('./warps-2.0.0.mcpack');
        await rm(path.join(directory, 'addons', 'warps'), { recursive: true });
        await rm(file);
        await cp(path.join(directory, 'addons'), file, { recursive: true });
        for (const [name, data] of packFiles('2.0.0')) {
            await mkdir(path.dirname(path.join(file, name)), { recursive: true });
            await writeFile(path.join(file, name), data);
        }

        expect(await addons.sync()).toEqual(['warps']);
        expect(logged.some((line) => line.includes('which is now a folder'))).toBe(true);
    });

    it('refuses to install a folder from inside the addon folder it would replace', async () => {
        const source = path.join(directory, 'addons', 'warps');
        for (const [name, data] of packFiles('1.0.0')) {
            await mkdir(path.dirname(path.join(source, name)), { recursive: true });
            await writeFile(path.join(source, name), data);
        }

        await expect(manager().install('./addons/warps')).rejects.toBeInstanceOf(
            PrismarineAddonErrors.AddonSourceInsideTarget
        );
        expect(await exists('addons', 'warps', 'manifest.json')).toBe(true);
    });

    it('links a linked folder again when a copy took the link’s place', async () => {
        const source = path.join(directory, 'src', 'my-addon');
        for (const [name, data] of packFiles('0.1.0')) {
            await mkdir(path.dirname(path.join(source, name)), { recursive: true });
            await writeFile(path.join(source, name), data);
        }
        const addons = manager();
        await addons.install('./src/my-addon');
        const target = path.join(directory, 'addons', 'my-addon');
        await rm(target);
        await cp(source, target, { recursive: true });

        await addons.sync();

        expect((await lstat(target)).isSymbolicLink()).toBe(true);
    });

    it('follows an https redirect and refuses one to http', async () => {
        const url = 'https://github.com/someone/packs/releases/download/v1/warps.mcpack';
        const moved = 'https://github.com/someone/packs/releases/download/v2/warps.mcpack';
        const insecure = 'https://github.com/someone/packs/releases/download/v1/evil.mcpack';
        github.replace(moved, pack('1.0.0'));
        github.redirect(url, moved);
        github.redirect(insecure, 'http://example.com/evil.mcpack');

        await manager().install(url);
        await expect(manager().install(insecure, 'evil')).rejects.toBeInstanceOf(
            PrismarineAddonErrors.AddonDownloadFailed
        );

        expect(await installedVersion('warps')).toBe('1.0.0');
        expect(github.requested).not.toContain('http://example.com/evil.mcpack');
    });

    it('stops a download larger than a pack may be', async () => {
        const url = 'https://github.com/someone/packs/releases/download/v1/warps.mcpack';
        github.replace(url, pack('1.0.0'));

        await expect(downloadPack(httpsFetch(github.fetcher), url, 64)).rejects.toBeInstanceOf(
            PrismarineAddonErrors.AddonTooLarge
        );
    });

    it.each([
        ['two spellings of one file', [['./manifest.json', '{}']]],
        ['two names that differ only in case', [['Manifest.json', '{}']]]
    ])('refuses a pack with %s', async (_, extra) => {
        const url = 'https://github.com/someone/packs/releases/download/v1/warps.mcpack';
        github.replace(
            url,
            writeZip(
                new Map([...packFiles('1.0.0'), ...extra.map(([name, text]) => [name!, encoder.encode(text)] as const)])
            )
        );

        await expect(manager().install(url)).rejects.toBeInstanceOf(PrismarineAddonErrors.InvalidAddonPack);
    });

    it('refuses a script pack whose manifest only a lenient reader accepts', async () => {
        const url = 'https://github.com/someone/packs/releases/download/v1/warps.mcpack';
        const files = packFiles('1.0.0');
        files.set(
            'manifest.json',
            encoder.encode(`${new TextDecoder().decode(files.get('manifest.json')).slice(0, -1)},}`)
        );
        github.replace(url, writeZip(files));

        await expect(manager().install(url)).rejects.toBeInstanceOf(PrismarineAddonErrors.InvalidAddonPack);
    });

    it('puts back an old folder an interrupted replacement left before it writes anything', async () => {
        const target = path.join(directory, 'addons', 'warps');
        const previous = path.join(directory, 'addons', '.warps.previous');
        await mkdir(previous, { recursive: true });
        await writeFile(path.join(previous, 'manifest.json'), '{}');

        // `a` is a file, so `a/b` cannot be written beside it and the write fails.
        await expect(
            writePackFolder(
                target,
                new Map([
                    ['a', new Uint8Array()],
                    ['a/b', new Uint8Array()]
                ])
            )
        ).rejects.toThrow();

        expect(await readFile(path.join(target, 'manifest.json'), 'utf8')).toBe('{}');
    });
});
