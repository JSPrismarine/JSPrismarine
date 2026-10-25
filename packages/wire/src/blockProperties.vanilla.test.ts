/**
 * The generated `Block Properties` against a real server's.
 *
 * `@jsprismarine/bedrock-data` publishes the 98 definitions a Bedrock
 * Dedicated Server 1.26.51.1 sent, and the cache that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates
 * holds the behavior pack those definitions were generated from. With both
 * in hand the comparison is exact, so this file reports agreement per field
 * rather than asserting a shape. It needs the cache, so it runs only with
 * JSP_VANILLA_BLOCKS set, the same gate `@jsprismarine/blocks` uses.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { block_definitions } from '@jsprismarine/bedrock-data';
import { resolveBlocks, vanillaBlockPalette } from '@jsprismarine/blocks';
import { load } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { buildBlockProperties } from './blockProperties';
import { assertBlockPaletteAgrees } from './palette';
import { nbtToPlain, readNetworkNbt } from './nbt';

import type { PlainNbt } from './nbt';

const enabled = !!process.env.JSP_VANILLA_BLOCKS;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const vanillaBehaviorPack = (): string => {
    const root = join(cacheRoot, 'bedrock-samples');
    for (const version of readdirSync(root)) {
        const unpacked = join(root, version, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'blocks'))) return pack;
        }
    }
    throw new Error(`no bedrock-samples behavior pack under ${root}; run the bedrock-data fetch:sources script`);
};

const isObject = (value: PlainNbt): value is Record<string, PlainNbt> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every leaf of a tag tree, as a dotted path to its value, so a diff names the field. */
const leaves = (value: PlainNbt, prefix = ''): Map<string, string> => {
    const flat = new Map<string, string>();
    if (isObject(value)) {
        for (const [key, child] of Object.entries(value))
            for (const [path, leaf] of leaves(child, prefix === '' ? key : `${prefix}.${key}`)) flat.set(path, leaf);
    } else if (Array.isArray(value)) {
        if (value.length === 0) flat.set(prefix, '[]');
        for (const [index, child] of value.entries())
            for (const [path, leaf] of leaves(child, `${prefix}[${index}]`)) flat.set(path, leaf);
    } else {
        flat.set(prefix, String(value));
    }

    return flat;
};

describe.skipIf(!enabled)('the data driven vanilla blocks against the captured server', () => {
    const built = (): ReturnType<typeof buildBlockProperties> => {
        const { definitions } = load([{ kind: 'directory', path: vanillaBehaviorPack() }]);
        const resolved = resolveBlocks(definitions.blocks.values());
        const byName = new Map([...resolved.types].map(([identifier, type]) => [identifier, type]));

        // In the order the capture lists them, so the comparison is pairwise.
        return buildBlockProperties(block_definitions.map((entry) => byName.get(entry.name)!));
    };

    it('declares the same 98 blocks', () => {
        const result = built();

        expect(result.properties.map((entry) => entry.name)).toEqual(block_definitions.map((entry) => entry.name));
        expect(result.untranslated).toEqual([]);
    });

    it('agrees with the capture field for field, and reports the tally', () => {
        const result = built();
        const captured = new Map(block_definitions.map((entry) => [entry.name, entry.definition]));

        let matched = 0;
        let missing = 0;
        let extra = 0;
        let differing = 0;
        let identicalBlocks = 0;
        const disagreements: string[] = [];

        for (const property of result.properties) {
            const ours = leaves(nbtToPlain(readNetworkNbt(property.definition)));
            const theirs = leaves(nbtToPlain(readNetworkNbt(captured.get(property.name)!)));
            let clean = true;

            for (const [path, value] of theirs) {
                const mine = ours.get(path);
                if (mine === undefined) {
                    missing++;
                    clean = false;
                    disagreements.push(`${property.name} ${path}: missing, expected ${value}`);
                } else if (mine === value) {
                    matched++;
                } else {
                    differing++;
                    clean = false;
                    disagreements.push(`${property.name} ${path}: ${mine}, expected ${value}`);
                }
            }
            for (const path of ours.keys()) {
                if (theirs.has(path)) continue;
                extra++;
                clean = false;
                disagreements.push(`${property.name} ${path}: sent, the server does not`);
            }
            if (clean) identicalBlocks++;
        }

        const total = matched + missing + differing;
        console.debug(
            `fields: ${matched}/${total} match, ${missing} missing, ${differing} differ, ${extra} extra; ` +
                `blocks: ${identicalBlocks}/${result.properties.length} identical`
        );
        if (disagreements.length > 0) console.debug(disagreements.slice(0, 40).join('\n'));

        expect(disagreements).toEqual([]);
    });

    it('declares a registry the captured palette agrees with', () => {
        expect(() => assertBlockPaletteAgrees(built().properties, vanillaBlockPalette())).not.toThrow();
    });

    it('writes bytes a real server would have written', () => {
        const result = built();
        const captured = new Map(block_definitions.map((entry) => [entry.name, entry.definition]));
        const identical = result.properties.filter((property) =>
            property.definition.equals(captured.get(property.name)!)
        );

        console.debug(`bytes: ${identical.length}/${result.properties.length} identical to the capture`);

        expect(result.properties.length - identical.length).toBe(0);
    });
});
