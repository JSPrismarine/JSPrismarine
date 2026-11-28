import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readZip } from '@jsprismarine/packs/zip';
import { afterEach, describe, expect, it } from 'vitest';

import type { AddonResourcePack } from '../addons/AddonManager';
import type { PackSummary } from '../addons/addonPack';
import { chunkOf, RESOURCE_PACK_CHUNK_SIZE, ServedResourcePacks, stackOrderOf } from './ServedResourcePacks';

const scratch: string[] = [];
afterEach(async () => {
    for (const directory of scratch.splice(0)) await rm(directory, { recursive: true, force: true });
});

/** A resource pack folder on disk, as the installer leaves it. */
const installed = async (
    uuid: string,
    files: Record<string, string | Uint8Array>,
    dependencies: readonly string[] = [],
    manifest: Partial<Pick<PackSummary, 'addon' | 'rayTracing' | 'subpacks'>> = {}
): Promise<AddonResourcePack> => {
    const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-served-'));
    scratch.push(directory);
    for (const [name, data] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
        await writeFile(path.join(directory, name), data);
    }
    const summary: PackSummary = {
        kind: 'resource',
        name: `Pack ${uuid.slice(0, 2)}`,
        uuid,
        version: '1.0.0',
        needsRestart: [],
        dependencies: dependencies.map((each) => ({ uuid: each, version: '1.0.0' })),
        addon: false,
        rayTracing: false,
        subpacks: [],
        ...manifest
    };
    return { key: 'addon', folder: '.', directory, summary };
};

const uuidOf = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** The header an encrypted pack's `contents.json` starts with, naming `contentId`, and no body. */
const encryptedContents = (contentId: string): Uint8Array => {
    const header = new Uint8Array(256);
    header.set([0xfc, 0xb9, 0xcf, 0x9b], 4);
    header[16] = contentId.length;
    header.set(new TextEncoder().encode(contentId), 17);
    return header;
};

/** A key file beside a pack's folder, cleaned up after the test. */
const keyBeside = async (pack: AddonResourcePack, key: string): Promise<void> => {
    await writeFile(`${pack.directory}.key`, key);
    scratch.push(`${pack.directory}.key`);
};

/** A world folder holding `world_resource_packs.json`, cleaned up after the test. */
const worldWith = async (entries: unknown): Promise<string> => {
    const folder = mkdtempSync(path.join(tmpdir(), 'jsprismarine-world-'));
    scratch.push(folder);
    await writeFile(path.join(folder, 'world_resource_packs.json'), JSON.stringify(entries));
    return folder;
};

describe('ServedResourcePacks', () => {
    it('zips each pack once per change in the installed list, and hashes the zip', async () => {
        const list = [await installed(uuidOf(1), { 'manifest.json': '{}', 'textures/a.png': 'png' })];
        let current: readonly AddonResourcePack[] = list;
        const served = new ServedResourcePacks(() => current);

        const [pack] = await served.packs();
        const again = await served.packs();

        expect(again[0]).toBe(pack);
        expect([...readZip(pack!.bytes).keys()]).toEqual(['manifest.json', 'textures/a.png']);
        expect(pack!.sha256).toEqual(createHash('sha256').update(pack!.bytes).digest());
        expect(pack!.resourceName).toBe(`${uuidOf(1)}_1.0.0`);
        expect(served.offered()).toEqual([pack]);

        current = [...list];
        expect((await served.packs())[0]).not.toBe(pack);
    });

    it('finds a pack by the name it was offered under or its bare UUID, after the list moved on', async () => {
        let current: readonly AddonResourcePack[] = [await installed(uuidOf(1), { 'manifest.json': '{}' })];
        const served = new ServedResourcePacks(() => current);
        const [first] = await served.packs();
        current = [];
        await served.packs();

        expect(served.find(`${uuidOf(1)}_1.0.0`)).toBe(first);
        expect(served.find(uuidOf(1).toUpperCase())).toBeUndefined();
        expect(served.offered()).toEqual([]);
        expect(served.find(`${uuidOf(2)}_1.0.0`)).toBeUndefined();
    });

    it('cuts a pack into chunks of the chunk size, and has none past its last', async () => {
        const big = new Uint8Array(RESOURCE_PACK_CHUNK_SIZE * 2);
        const served = new ServedResourcePacks(() => [current]);
        const current = await installed(uuidOf(1), { 'manifest.json': '{}', 'blob.bin': big });
        const [pack] = await served.packs();

        expect(pack!.chunkCount).toBe(Math.ceil(pack!.bytes.byteLength / RESOURCE_PACK_CHUNK_SIZE));
        const chunks = Array.from({ length: pack!.chunkCount }, (_, index) => chunkOf(pack!, index)!);
        expect(chunks.map(({ offset }) => offset)).toEqual(chunks.map((_, index) => index * RESOURCE_PACK_CHUNK_SIZE));
        expect(chunks.reduce((total, { data }) => total + data.byteLength, 0)).toBe(pack!.bytes.byteLength);
        expect(chunkOf(pack!, pack!.chunkCount)).toBeUndefined();
        expect(chunkOf(pack!, -1)).toBeUndefined();
    });
});

describe('the pack info a login sends for each pack', () => {
    const KEY = '0123456789abcdef0123456789abcdef';

    it("sends an encrypted pack's key from beside its folder, named by its contents.json's content id", async () => {
        const pack = await installed(uuidOf(1), {
            'manifest.json': '{}',
            'contents.json': encryptedContents(uuidOf(1).toUpperCase())
        });
        await keyBeside(pack, `${KEY}\n`);

        const [served] = await new ServedResourcePacks(() => [pack]).packs();

        expect(served).toMatchObject({ contentKey: KEY, contentIdentity: uuidOf(1).toUpperCase() });
        // The key stays out of what the client downloads.
        expect([...readZip(served!.bytes).keys()]).toEqual(['contents.json', 'manifest.json']);
    });

    it('names a plain pack by its UUID with no key, whatever file sits beside it', async () => {
        const pack = await installed(uuidOf(1), { 'manifest.json': '{}' });
        await keyBeside(pack, KEY);

        const [served] = await new ServedResourcePacks(() => [pack]).packs();

        expect(served).toMatchObject({ contentKey: '', contentIdentity: uuidOf(1) });
    });

    it('warns of an encrypted pack whose key is missing or the wrong length, and sends it without one', async () => {
        const missing = await installed(uuidOf(1), { 'manifest.json': '{}', 'contents.json': encryptedContents('a') });
        const short = await installed(uuidOf(2), { 'manifest.json': '{}', 'contents.json': encryptedContents('b') });
        await keyBeside(short, 'too short');
        const warnings: string[] = [];

        const served = await new ServedResourcePacks(() => [missing, short], {
            warn: (message) => warnings.push(message)
        }).packs();

        expect(served.map(({ contentKey }) => contentKey)).toEqual(['', '']);
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain(`${missing.directory}.key is missing`);
        expect(warnings[1]).toContain('it holds 9 bytes, and a content key is 32');
    });

    it('carries the ray tracing capability and the subpacks the manifest lists', async () => {
        const pack = await installed(uuidOf(1), { 'manifest.json': '{}' }, [], {
            rayTracing: true,
            subpacks: ['low', 'high']
        });

        const [served] = await new ServedResourcePacks(() => [pack]).packs();

        expect(served).toMatchObject({ rayTracing: true, subpacks: ['low', 'high'] });
    });

    it("picks each pack's subpack from the world's world_resource_packs.json, as BDS does", async () => {
        const chosen = await installed(uuidOf(1), { 'manifest.json': '{}' }, [], { subpacks: ['low', 'high'] });
        const unknown = await installed(uuidOf(2), { 'manifest.json': '{}' }, [], { subpacks: ['low'] });
        const otherVersion = await installed(uuidOf(3), { 'manifest.json': '{}' }, [], { subpacks: ['low'] });
        const unpicked = await installed(uuidOf(4), { 'manifest.json': '{}' }, [], { subpacks: ['low'] });
        const folder = await worldWith([
            { pack_id: uuidOf(1).toUpperCase(), version: [1, 0, 0], subpack: 'high' },
            { pack_id: uuidOf(2), version: [1, 0, 0], subpack: 'ultra' },
            { pack_id: uuidOf(3), version: [2, 0, 0], subpack: 'low' },
            { pack_id: uuidOf(4), version: [1, 0, 0] }
        ]);
        const served = new ServedResourcePacks(() => [chosen, unknown, otherVersion, unpicked], {
            worldFolder: () => folder
        });
        const packs = await served.packs();

        const subpacks = await served.subpacks(packs);

        expect(packs.map(({ resourceName }) => subpacks.get(resourceName))).toEqual(['high', '', '', '']);
        // The pack stack the same login sends next names the same subpacks.
        expect(packs.map(({ resourceName }) => served.chosenSubpack(resourceName))).toEqual(['high', '', '', '']);
    });

    it('picks no subpack for a world without the file, and warns of one that does not read', async () => {
        const pack = await installed(uuidOf(1), { 'manifest.json': '{}' }, [], { subpacks: ['low'] });
        const empty = mkdtempSync(path.join(tmpdir(), 'jsprismarine-world-'));
        scratch.push(empty);
        const broken = mkdtempSync(path.join(tmpdir(), 'jsprismarine-world-'));
        scratch.push(broken);
        await writeFile(path.join(broken, 'world_resource_packs.json'), '{ "not": "a list" }');
        const warnings: string[] = [];

        for (const folder of [empty, broken]) {
            const served = new ServedResourcePacks(() => [pack], {
                worldFolder: () => folder,
                warn: (message) => warnings.push(message)
            });
            const subpacks = await served.subpacks(await served.packs());
            expect(subpacks.get(`${uuidOf(1)}_1.0.0`)).toBe('');
        }
        expect(warnings).toEqual([`${path.join(broken, 'world_resource_packs.json')} is not a list`]);
    });
});

describe('stackOrderOf', () => {
    it('keeps the installed order but puts a pack above the packs it depends on', () => {
        const pack = (uuid: string, dependencies: string[] = []) => ({ uuid, dependencies });
        const base = pack('base');
        const other = pack('other');
        const skin = pack('skin', ['base']);

        expect(stackOrderOf([base, other, skin]).map(({ uuid }) => uuid)).toEqual(['skin', 'base', 'other']);
        expect(stackOrderOf([other, skin, base]).map(({ uuid }) => uuid)).toEqual(['other', 'skin', 'base']);
    });
});
