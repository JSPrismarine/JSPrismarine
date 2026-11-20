/**
 * Every pinned Java release's item type table, preview included. `itemTypes.test.ts` holds the
 * default release's table to the loader; this checks that each release has a table of its own,
 * generated for its pair, that accounts for every one of that release's Java items.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { javaBedrockPair, pinnedJavaReleases } from '@jsprismarine/bedrock-data/sources';
import type { ItemsTable } from '@jsprismarine/mapping/tables';
import { describe, expect, it } from 'vitest';

import type { ItemTypesTable } from './tables';

/** A committed JSON file; parsed JSON has no type the compiler can see, so the caller names it. */
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const bds = readJson<{ bds: { versions: Record<string, { serverVersion: string }> } }>(
    join(import.meta.dirname, '../../bedrock-data/sources.json')
).bds;

const pairs = pinnedJavaReleases.flatMap((release) => {
    const pair = javaBedrockPair(release);
    return pair === undefined ? [] : [pair];
});

describe.each(pairs)('the $java item type table', (pair) => {
    const path = join(import.meta.dirname, 'tables', pair.java, 'itemTypes.json');

    it('exists and was generated for its pair', () => {
        expect(existsSync(path), path).toBe(true);
        const table = readJson<ItemTypesTable>(path);
        expect(table.javaVersion).toBe(pair.java);
        expect(table.bedrockVersion).toBe(bds.versions[String(pair.protocol)]?.serverVersion);
    });

    it("accounts for every one of the release's Java items, as a row or as an exception", () => {
        const table = readJson<ItemTypesTable>(path);
        const javaItems = readJson<ItemsTable>(
            join(import.meta.dirname, '../../mapping/src/tables', pair.java, 'items.json')
        ).items;
        const carried = new Set<string>(table.exceptedJavaItems);
        for (const row of Object.values(table.items)) {
            carried.add(row.java);
            for (const merged of row.merged ?? []) carried.add(merged.java);
        }
        expect([...carried].sort()).toEqual(Object.keys(javaItems).sort());
        expect(table.javaItemCount).toBe(carried.size);
    });
});
