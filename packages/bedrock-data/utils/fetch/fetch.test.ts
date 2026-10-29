import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { linkResources, parseProtocolArgument } from './cloudburst.ts';
import { fetchSource, hashSourceContent, resolveContentRoot } from './fetch.ts';
import { hashFolder } from './folder-hash.ts';
import { verifyFileHash } from './hash.ts';
import {
    bdsDescriptor,
    cloudburstDescriptor,
    type BdsData,
    type CloudburstData,
    type SourceDescriptor
} from './manifest.ts';
import { extractZip, readZipEntriesFrom, readZipEntry } from './unzip.ts';

/** Builds a zip archive of stored (uncompressed) entries, for tests only. */
const buildZip = (entries: Record<string, string>): Buffer => {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, text] of Object.entries(entries)) {
        const nameBytes = Buffer.from(name, 'utf8');
        const data = Buffer.from(text, 'utf8');
        const checksum = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        locals.push(local, nameBytes, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length + data.length;
    }
    const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(entries).length, 8);
    end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
};

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

/** A fetch stub that serves fixed bytes and counts calls. */
const stubFetch = (body: Buffer) => {
    const calls: string[] = [];
    const impl: typeof fetch = async (input) => {
        calls.push(String(input));
        return new Response(new Uint8Array(body));
    };
    return { impl, calls };
};

const failingFetch: typeof fetch = async () => {
    throw new Error('network access not expected in this test');
};

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jsp-fetch-test-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

const archiveDescriptor = (hashValue: string): SourceDescriptor => ({
    name: 'sample',
    version: '1.0.0',
    url: 'https://example.invalid/sample.zip',
    hash: { algorithm: 'sha256', value: hashValue },
    unpack: true,
    fileName: 'sample.zip',
    envOverride: 'JSP_SAMPLE_PATH'
});

describe('verifyFileHash', () => {
    it('accepts a matching digest and rejects a mismatch', async () => {
        const file = join(dir, 'file.bin');
        await writeFile(file, 'content');
        const good = sha256(Buffer.from('content'));
        await expect(verifyFileHash(file, { algorithm: 'sha256', value: good })).resolves.toBeUndefined();
        await expect(verifyFileHash(file, { algorithm: 'sha256', value: 'f'.repeat(64) })).rejects.toThrow(
            /sha256 mismatch/
        );
    });
});

describe('fetchSource', () => {
    it('downloads, verifies and unpacks on a cache miss', async () => {
        const zip = buildZip({ 'pack/a.txt': 'alpha' });
        const { impl, calls } = stubFetch(zip);
        const cacheRoot = join(dir, 'cache');
        const fetched = await fetchSource(archiveDescriptor(sha256(zip)), { cacheRoot, env: {}, fetchImpl: impl });
        expect(calls).toHaveLength(1);
        expect(fetched.fromCache).toBe(false);
        await expect(readFile(join(fetched.contentPath, 'pack/a.txt'), 'utf8')).resolves.toBe('alpha');
    });

    it('is a no-op when the verified content is already cached', async () => {
        const zip = buildZip({ 'pack/a.txt': 'alpha' });
        const cacheRoot = join(dir, 'cache');
        const descriptor = archiveDescriptor(sha256(zip));
        await fetchSource(descriptor, { cacheRoot, env: {}, fetchImpl: stubFetch(zip).impl });
        const second = await fetchSource(descriptor, { cacheRoot, env: {}, fetchImpl: failingFetch });
        expect(second.fromCache).toBe(true);
        await expect(readFile(join(second.contentPath, 'pack/a.txt'), 'utf8')).resolves.toBe('alpha');
    });

    it('rejects a download whose digest does not match the manifest', async () => {
        const zip = buildZip({ 'pack/a.txt': 'alpha' });
        const cacheRoot = join(dir, 'cache');
        await expect(
            fetchSource(archiveDescriptor('0'.repeat(64)), { cacheRoot, env: {}, fetchImpl: stubFetch(zip).impl })
        ).rejects.toThrow(/sha256 mismatch/);
        // A failed download must not count as cached on the next run.
        await expect(
            fetchSource(archiveDescriptor('0'.repeat(64)), { cacheRoot, env: {}, fetchImpl: failingFetch })
        ).rejects.toThrow(/network access not expected/);
    });

    it('uses the environment override without touching the network', async () => {
        const local = join(dir, 'local-copy');
        await mkdir(local, { recursive: true });
        const fetched = await fetchSource(archiveDescriptor('0'.repeat(64)), {
            cacheRoot: join(dir, 'cache'),
            env: { JSP_SAMPLE_PATH: local },
            fetchImpl: failingFetch
        });
        expect(fetched.fromOverride).toBe(true);
        expect(fetched.contentPath).toBe(local);
    });

    it('fails when the environment override points at nothing', async () => {
        await expect(
            fetchSource(archiveDescriptor('0'.repeat(64)), {
                cacheRoot: join(dir, 'cache'),
                env: { JSP_SAMPLE_PATH: join(dir, 'missing') },
                fetchImpl: failingFetch
            })
        ).rejects.toThrow();
    });
});

describe('extractZip', () => {
    it('refuses entries that would escape the destination', async () => {
        const zip = buildZip({ '../evil.txt': 'nope' });
        const archive = join(dir, 'evil.zip');
        await writeFile(archive, zip);
        await expect(extractZip(archive, join(dir, 'out'))).rejects.toThrow(/unsafe name/);
    });

    it('checks every name for safety even when the filter would skip it', async () => {
        const zip = buildZip({ 'pack/a.txt': 'alpha', '../evil.txt': 'nope' });
        const archive = join(dir, 'mixed.zip');
        await writeFile(archive, zip);
        await expect(extractZip(archive, join(dir, 'out'), (name) => name === 'pack/a.txt')).rejects.toThrow(
            /unsafe name/
        );
    });
});

describe('an extract allowlist', () => {
    const allowlisted = (hashValue: string, extract: string[]): SourceDescriptor => ({
        ...archiveDescriptor(hashValue),
        extract
    });

    it('unpacks only the named files from behind the wrapper directory', async () => {
        const zip = buildZip({
            'Data-abc123/entity_identifiers.dat': 'entities',
            'Data-abc123/LICENSE': 'apache',
            'Data-abc123/recipes.json': 'huge'
        });
        const fetched = await fetchSource(allowlisted(sha256(zip), ['LICENSE', 'entity_identifiers.dat']), {
            cacheRoot: join(dir, 'cache'),
            env: {},
            fetchImpl: stubFetch(zip).impl
        });

        const root = await resolveContentRoot(fetched.contentPath);
        await expect(readFile(join(root, 'LICENSE'), 'utf8')).resolves.toBe('apache');
        await expect(readFile(join(root, 'entity_identifiers.dat'), 'utf8')).resolves.toBe('entities');
        await expect(readFile(join(root, 'recipes.json'), 'utf8')).rejects.toThrow();
    });

    it('re-unpacks when the allowlist grows, even though the pin is unchanged', async () => {
        const zip = buildZip({ 'Data-abc123/LICENSE': 'apache', 'Data-abc123/blocks.json': '{}' });
        const cacheRoot = join(dir, 'cache');
        const hashValue = sha256(zip);
        await fetchSource(allowlisted(hashValue, ['LICENSE']), {
            cacheRoot,
            env: {},
            fetchImpl: stubFetch(zip).impl
        });

        const second = await fetchSource(allowlisted(hashValue, ['LICENSE', 'blocks.json']), {
            cacheRoot,
            env: {},
            fetchImpl: stubFetch(zip).impl
        });

        expect(second.fromCache).toBe(false);
        const root = await resolveContentRoot(second.contentPath);
        await expect(readFile(join(root, 'blocks.json'), 'utf8')).resolves.toBe('{}');
    });
});

describe('bdsDescriptor', () => {
    const data: BdsData = {
        defaultProtocolVersion: 2193,
        versions: {
            '2193': {
                minecraftVersion: '1.26.51',
                serverVersion: '1.26.51.1',
                url: 'https://example.invalid/bedrock-server-1.26.51.1.zip',
                sha1: 'a'.repeat(40),
                sha256: 'a'.repeat(64),
                sizeInBytes: 1
            },
            '2225': {
                minecraftVersion: '1.26.60',
                serverVersion: '1.26.60.6',
                url: 'https://example.invalid/bedrock-server-1.26.60.6.zip',
                sha1: 'b'.repeat(40),
                sha256: 'b'.repeat(64),
                sizeInBytes: 2
            }
        }
    };

    it('caches each protocol version under its own directory', () => {
        expect(bdsDescriptor(data, 2193).version).toBe('v2193');
        expect(bdsDescriptor(data, 2225).version).toBe('v2225');
        expect(bdsDescriptor(data, 2225).url).toBe('https://example.invalid/bedrock-server-1.26.60.6.zip');
    });

    it('names the zip by its server build, which differs from the protocol', () => {
        expect(bdsDescriptor(data, 2225).fileName).toBe('bedrock-server-1.26.60.6.zip');
    });

    it('falls back to the manifest default and shares one override variable', () => {
        const fallback = bdsDescriptor(data);
        expect(fallback.version).toBe('v2193');
        expect(fallback.envOverride).toBe('JSP_BDS_PATH');
    });

    it('names the pinned versions when asked for one that is not pinned', () => {
        expect(() => bdsDescriptor(data, 1234)).toThrow(/protocol 1234; pinned: 2193, 2225/);
    });
});

describe('the pinned servers in sources.json', () => {
    it('verifies each sha256 against the measured size and Mojang build hash', async () => {
        const { loadBdsData } = await import('./manifest.ts');
        const pinned = await loadBdsData(join(import.meta.dirname, '../../sources.json'));
        expect(Object.keys(pinned.versions).length).toBeGreaterThan(0);
        expect(pinned.versions[String(pinned.defaultProtocolVersion)]).toBeDefined();
        for (const [protocol, version] of Object.entries(pinned.versions)) {
            expect(version.sha256, `protocol ${protocol}`).toMatch(/^[0-9a-f]{64}$/);
            expect(version.sha1, `protocol ${protocol}`).toMatch(/^[0-9a-f]{40}$/);
            expect(version.sizeInBytes, `protocol ${protocol}`).toBeGreaterThan(0);
            expect(version.url, `protocol ${protocol}`).toContain(`bedrock-server-${version.serverVersion}.zip`);
            expect(version.serverVersion, `protocol ${protocol}`).toContain(version.minecraftVersion);
        }
    });
});

describe('cloudburstDescriptor', () => {
    const data: CloudburstData = {
        repo: 'CloudburstMC/Data',
        defaultProtocolVersion: 2193,
        extract: ['LICENSE'],
        versions: {
            '2193': {
                minecraftVersion: '1.26.51',
                commit: 'aaa',
                url: 'https://example.invalid/aaa.zip',
                sha256: 'a'.repeat(64)
            },
            '2225': {
                minecraftVersion: '1.26.60',
                commit: 'bbb',
                url: 'https://example.invalid/bbb.zip',
                sha256: 'b'.repeat(64)
            }
        }
    };

    it('caches each protocol version under its own directory', () => {
        expect(cloudburstDescriptor(data, 2193).version).toBe('v2193');
        expect(cloudburstDescriptor(data, 2225).version).toBe('v2225');
        expect(cloudburstDescriptor(data, 2225).url).toBe('https://example.invalid/bbb.zip');
    });

    it('falls back to the manifest default and shares one override variable', () => {
        const fallback = cloudburstDescriptor(data);
        expect(fallback.version).toBe('v2193');
        expect(fallback.envOverride).toBe('JSP_CLOUDBURST_DATA_PATH');
        expect(fallback.extract).toEqual(['LICENSE']);
    });

    it('names the pinned versions when asked for one that is not pinned', () => {
        expect(() => cloudburstDescriptor(data, 1234)).toThrow(/protocol 1234; pinned: 2193, 2225/);
    });
});

describe('linkResources', () => {
    it('points the stable path at a version directory and follows a switch', async () => {
        const link = join(dir, 'resources');
        for (const version of ['v2193', 'v2225']) {
            await mkdir(join(dir, version), { recursive: true });
            await writeFile(join(dir, version, 'entity_identifiers.dat'), version);
        }

        expect(await linkResources(join(dir, 'v2193'), link)).toBe('symlink');
        await expect(readFile(join(link, 'entity_identifiers.dat'), 'utf8')).resolves.toBe('v2193');

        expect(await linkResources(join(dir, 'v2193'), link)).toBe('unchanged');
        expect(await linkResources(join(dir, 'v2225'), link)).toBe('symlink');
        await expect(readFile(join(link, 'entity_identifiers.dat'), 'utf8')).resolves.toBe('v2225');
    });
});

describe('parseProtocolArgument', () => {
    it('reads a protocol version and defaults to none', () => {
        expect(parseProtocolArgument(['node', 'script.ts', '--protocol', '2225'])).toBe(2225);
        expect(parseProtocolArgument(['node', 'script.ts'])).toBeUndefined();
        expect(() => parseProtocolArgument(['node', 'script.ts', '--protocol'])).toThrow(/--protocol needs/);
    });
});

describe('readZipEntry', () => {
    it('reads one entry and reports a missing one as undefined', async () => {
        const archive = join(dir, 'bundle.zip');
        await writeFile(archive, buildZip({ 'version.json': '{"id":"26.3"}', 'other.txt': 'ignored' }));

        expect((await readZipEntry(archive, 'version.json'))?.toString('utf8')).toBe('{"id":"26.3"}');
        expect(await readZipEntry(archive, 'absent.json')).toBeUndefined();
    });
});

describe('readZipEntriesFrom', () => {
    it('reads the entries the filter accepts and leaves the rest alone', () => {
        const archive = buildZip({
            'data/minecraft/structure/igloo/top.nbt': 'igloo',
            'data/minecraft/loot_table/blocks/stone.json': 'loot',
            'data/minecraft/structure/village/house.nbt': 'house'
        });

        const found = readZipEntriesFrom(archive, (name) => name.endsWith('.nbt'));

        expect([...found.keys()].sort()).toEqual([
            'data/minecraft/structure/igloo/top.nbt',
            'data/minecraft/structure/village/house.nbt'
        ]);
        expect(found.get('data/minecraft/structure/igloo/top.nbt')?.toString('utf8')).toBe('igloo');
    });

    it('refuses an entry whose name could escape a destination directory', () => {
        const archive = buildZip({ '../evil.nbt': 'nope' });

        expect(() => readZipEntriesFrom(archive, () => true)).toThrow(/unsafe name/);
    });
});

describe('hashFolder', () => {
    it('is stable for identical content and changes with content, name or layout', async () => {
        const make = async (name: string, files: Record<string, string>) => {
            const root = join(dir, name);
            for (const [relative, text] of Object.entries(files)) {
                await mkdir(join(root, relative, '..'), { recursive: true });
                await writeFile(join(root, relative), text);
            }
            return hashFolder(root);
        };
        const base = { 'a.txt': 'one', 'sub/b.txt': 'two' };
        const first = await make('one', base);
        const second = await make('two', base);
        expect(first).toBe(second);
        expect(await make('content', { ...base, 'a.txt': 'changed' })).not.toBe(first);
        expect(await make('renamed', { 'a.txt': 'one', 'sub/c.txt': 'two' })).not.toBe(first);
        expect(await make('moved', { 'a.txt': 'one', 'b.txt': 'two' })).not.toBe(first);
    });
});

describe('hashSourceContent', () => {
    it('hashes each top-level folder behind a GitHub wrapper directory', async () => {
        const zip = buildZip({
            'repo-abc123/mappings/blocks.json': '{}',
            'repo-abc123/README.md': 'hello'
        });
        const cacheRoot = join(dir, 'cache');
        const fetched = await fetchSource(archiveDescriptor(sha256(zip)), {
            cacheRoot,
            env: {},
            fetchImpl: stubFetch(zip).impl
        });
        expect(await resolveContentRoot(fetched.contentPath)).toBe(join(fetched.contentPath, 'repo-abc123'));
        const hashes = await hashSourceContent(fetched);
        expect(Object.keys(hashes.entries)).toEqual(['README.md', 'mappings']);
        expect(hashes.version).toBe('1.0.0');
    });

    it('hashes a file override directly', async () => {
        const jar = join(dir, 'server.jar');
        await writeFile(jar, 'jar bytes');
        const fetched = await fetchSource(
            { ...archiveDescriptor('0'.repeat(64)), unpack: false, envOverride: 'JSP_JAR' },
            { cacheRoot: join(dir, 'cache'), env: { JSP_JAR: jar }, fetchImpl: failingFetch }
        );
        const hashes = await hashSourceContent(fetched);
        expect(hashes.entries).toEqual({ 'server.jar': sha256(Buffer.from('jar bytes')) });
    });
});

// A real network fetch of the smallest pinned source, run only when
// JSP_FETCH_INTEGRATION=1 is set.
describe.runIf(process.env.JSP_FETCH_INTEGRATION === '1')('integration', () => {
    it('fetches and verifies the pinned GeyserMC mappings', async () => {
        const { loadSourceDescriptors } = await import('./manifest.ts');
        const descriptors = await loadSourceDescriptors(join(import.meta.dirname, '../../sources.json'));
        const mappings = descriptors.find((descriptor) => descriptor.name === 'geyser-mappings');
        if (mappings === undefined) throw new Error('geyser-mappings missing from sources.json');
        const fetched = await fetchSource(mappings, { cacheRoot: join(dir, 'cache'), env: {} });
        const root = await resolveContentRoot(fetched.contentPath);
        await expect(readFile(join(root, 'items.json'), 'utf8')).resolves.toContain('bedrock_identifier');
    }, 120_000);
});
