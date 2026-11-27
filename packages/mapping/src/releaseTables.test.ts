/**
 * Every pinned Java release's tables, checked against the Bedrock captures of the protocol that
 * release pairs with. `mappingProperties.test.ts` holds the default release's tables to the
 * reviewed loss lists; this covers the rest of the pairs too, preview included, on the properties
 * that hold for any release: each table belongs to its pair, every Bedrock target exists in that
 * protocol's palette, item table and identifier list, and every Java state has a target.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { javaBedrockPair, pinnedJavaReleases } from '@jsprismarine/bedrock-data/sources';
import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';
import { describe, expect, it } from 'vitest';

import type { BlocksTable, EntitiesTable, ItemsTable } from './tables';

const tablesRoot = join(import.meta.dirname, 'tables');
const capturesRoot = join(import.meta.dirname, '../../bedrock-data/src/jsp');

/** A committed JSON file; parsed JSON has no type the compiler can see, so the caller names it. */
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

interface PaletteFile {
    states: Record<string, Record<string, string | number>>;
    domains: Record<string, Record<string, { values: (string | number | boolean)[] }>>;
}

const normalize = (value: string | number | boolean): string | number =>
    typeof value === 'boolean' ? Number(value) : value;

/** The number of states a run-length encoded target list covers. */
const stateCount = (targets: BlocksTable['blocks'][string]['targets']): number =>
    targets.reduce<number>((total, target) => total + (Array.isArray(target) ? target[1] : 1), 0);

const pairs = pinnedJavaReleases.flatMap((release) => {
    const pair = javaBedrockPair(release);
    return pair === undefined ? [] : [pair];
});

it('pairs every pinned Java release with a protocol', () => {
    expect(pairs.map((pair) => pair.java)).toEqual(pinnedJavaReleases);
});

describe.each(pairs)('the $java tables', (pair) => {
    const dir = join(tablesRoot, pair.java);

    it('exist and belong to their pair', () => {
        expect(existsSync(dir), dir).toBe(true);
        expect(readJson(join(dir, 'pair.json'))).toEqual(pair);
    });

    it(`map every Java block state onto a block state of the ${pair.protocol} palette`, () => {
        const blocks = readJson<BlocksTable>(join(dir, 'blocks.json'));
        const palette = readJson<PaletteFile>(blockPaletteSnapshotPath(pair.protocol));
        for (const [name, keys, rows] of blocks.statePalette) {
            const identifier = `minecraft:${name}`;
            expect(Object.keys(palette.states[identifier] ?? {}).sort(), identifier).toEqual([...keys].sort());
            for (const row of rows) {
                keys.forEach((key, axis) => {
                    const domain = (palette.domains[identifier]?.[key]?.values ?? []).map(normalize);
                    expect(domain, `${identifier} ${key}`).toContain(row[axis]);
                });
            }
        }
        const targetCount = blocks.statePalette.reduce((total, [, , rows]) => total + rows.length, 0);
        for (const [name, block] of Object.entries(blocks.blocks)) {
            const expected = Object.values(block.properties ?? {}).reduce((total, values) => total * values.length, 1);
            expect(stateCount(block.targets), name).toBe(expected);
            for (const target of block.targets) {
                const index = Array.isArray(target) ? target[0] : target;
                expect(index, name).toBeLessThan(targetCount);
            }
        }
    });

    it('give every Java block state of the block table its support facts', () => {
        const blocks = readJson<BlocksTable>(join(dir, 'blocks.json'));
        const support = readJson<{ blocks: Record<string, number | (number | [number, number])[]> }>(
            join(dir, 'blockSupport.json')
        );
        expect(Object.keys(support.blocks)).toEqual(Object.keys(blocks.blocks));
        for (const [name, block] of Object.entries(blocks.blocks)) {
            const runs = support.blocks[name]!;
            if (typeof runs === 'number') continue;
            const expected = Object.values(block.properties ?? {}).reduce((total, values) => total * values.length, 1);
            expect(stateCount(runs), name).toBe(expected);
        }
    });

    it(`map every Java item onto an item of the ${pair.protocol} item table`, () => {
        const items = readJson<ItemsTable>(join(dir, 'items.json'));
        const itemTable = readJson<Record<string, unknown>>(
            join(capturesRoot, `v${pair.protocol}`, 'required_item_list.json')
        );
        for (const [javaId, entry] of Object.entries(items.items)) {
            expect(itemTable, javaId).toHaveProperty([entry.bedrockIdentifier]);
        }
    });

    it(`map every Java entity type onto an identifier the ${pair.protocol} server lists`, () => {
        const entities = readJson<EntitiesTable>(join(dir, 'entities.json'));
        const listed = new Set(entities.bedrockIdentifiers);
        for (const [javaId, bedrockId] of Object.entries(entities.entities)) {
            expect(listed.has(bedrockId), `${javaId} -> ${bedrockId}`).toBe(true);
        }
    });
});
