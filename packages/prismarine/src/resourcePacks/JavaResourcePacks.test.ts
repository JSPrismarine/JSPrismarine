import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readZip, writeZip } from '@jsprismarine/packs/zip';
import { afterEach, describe, expect, it } from 'vitest';

import { JavaResourcePacks, javaPackKey } from './JavaResourcePacks';
import type { ServedResourcePack } from './ServedResourcePacks';

const encoder = new TextEncoder();
const target = { release: '26.3', format: [97, 1] as const };

/** A Bedrock pack as `ServedResourcePacks` serves it: zipped, with its hash. */
const served = (name: string, lang: string): ServedResourcePack => {
    const bytes = writeZip(new Map([['texts/en_US.lang', encoder.encode(lang)]]));
    return {
        key: name,
        name,
        uuid: '00000000-0000-4000-8000-000000000000',
        version: '1.0.0',
        resourceName: `${name}_1.0.0`,
        addon: false,
        rayTracing: false,
        subpacks: [],
        contentIdentity: '',
        contentKey: '',
        bytes,
        sha256: createHash('sha256').update(bytes).digest(),
        chunkCount: 1
    };
};

const scratch: string[] = [];
afterEach(async () => {
    for (const directory of scratch.splice(0)) await rm(directory, { recursive: true, force: true });
});

const store = (directory: string, bedrock: () => readonly ServedResourcePack[]) =>
    new JavaResourcePacks({
        bedrock: async () => bedrock(),
        target,
        cacheDirectory: directory,
        log: { info: () => {}, debug: () => {} }
    });

describe('JavaResourcePacks', () => {
    const cache = (): string => {
        const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-java-packs-'));
        scratch.push(directory);
        return directory;
    };

    it('converts a stack once and serves it by its SHA-1, from the cache on the next start', async () => {
        const directory = cache();
        const stack = [served('furniture', 'tile.lamp.name=Lamp')];
        const first = store(directory, () => stack);

        const pack = await first.current();
        expect(await first.current()).toBe(pack);
        expect(first.conversions).toBe(1);
        expect(pack!.sha1).toBe(createHash('sha1').update(pack!.bytes).digest('hex'));
        expect(first.find(pack!.sha1)).toBe(pack);
        expect(readZip(pack!.bytes).has('assets/bedrock/lang/en_us.json')).toBe(true);
        expect(await readdir(directory)).toEqual([`${javaPackKey(target, stack)}.zip`]);

        const restarted = store(directory, () => stack);
        const again = await restarted.current();
        expect(restarted.conversions).toBe(0);
        expect(again).toMatchObject({ id: pack!.id, sha1: pack!.sha1 });
    });

    it('builds again when the custom items it draws change, and keys the build by them', async () => {
        const directory = cache();
        const stack = [served('furniture', 'item.furniture:lamp.name=Lamp')];
        let items = [{ model: 'furniture:lamp', icon: 'lamp' }];
        const packs = new JavaResourcePacks({
            bedrock: async () => stack,
            items: () => items,
            target,
            cacheDirectory: directory,
            log: { info: () => {}, debug: () => {} }
        });

        const first = await packs.current();
        expect(await packs.current()).toBe(first);
        items = [...items, { model: 'furniture:chair', icon: 'chair' }];
        const second = await packs.current();
        expect(packs.conversions).toBe(2);
        expect(second!.key).toBe(javaPackKey(target, stack, items));
        expect(second!.key).not.toBe(first!.key);
        expect(javaPackKey(target, stack, [...items].reverse())).toBe(second!.key);
        expect(javaPackKey(target, stack, [])).toBe(javaPackKey(target, stack));
    });

    it('keeps every pack this run gave and deletes the cache files no run of it gave', async () => {
        const directory = cache();
        await writeFile(path.join(directory, 'stale.zip'), 'old');
        let stack: readonly ServedResourcePack[] = [served('furniture', 'a=1')];
        const packs = store(directory, () => stack);

        const first = await packs.current();
        stack = [served('furniture', 'a=2')];
        const second = await packs.current();

        expect(second!.sha1).not.toBe(first!.sha1);
        expect(packs.find(first!.sha1)).toBe(first);
        expect((await readdir(directory)).sort()).toEqual([`${first!.key}.zip`, `${second!.key}.zip`].sort());
    });

    it('builds again after a build failed, rather than handing out the failure', async () => {
        const parent = cache();
        // A file where the cache folder should be, so the first build's write fails.
        const directory = path.join(parent, 'java-packs');
        await writeFile(directory, 'in the way');
        const stack = [served('furniture', 'a=1')];
        const packs = store(directory, () => stack);

        await expect(packs.current()).rejects.toThrow();
        await rm(directory);
        const pack = await packs.current();

        expect(pack?.sha1).toMatch(/^[0-9a-f]{40}$/);
        expect(packs.conversions).toBe(1);
    });

    it('offers no pack when no addon has a resource pack', async () => {
        expect(await store(cache(), () => []).current()).toBeUndefined();
    });

    it('keys a conversion by the stack in order', () => {
        const a = served('a', 'x=1');
        const b = served('b', 'y=1');
        expect(javaPackKey(target, [a, b])).not.toBe(javaPackKey(target, [b, a]));
        expect(javaPackKey(target, [a])).not.toBe(javaPackKey({ ...target, format: [98, 0] }, [a]));
    });
});
