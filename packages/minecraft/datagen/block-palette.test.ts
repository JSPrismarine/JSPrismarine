import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards the two things a block palette capture used to get wrong.
 *
 * A block the place pass could not stand up anywhere is missing from the catalog, and a block
 * missing from the catalog has no schema at all. Three needed a support the pass did not
 * provide - nether wart soul sand, frog spawn water, a mushroom something it can root in out
 * of the light - and `palette-pack/scripts/place.js` now offers all three.
 *
 * The values in `states` used to be whatever the saved world happened to hold, which depends on
 * neighbors, random ticks and the placer, so 54 blocks disagreed between two captures of one
 * server. `merge-block-palette.mjs` now writes the value the game declares for the block
 * instead, which is determined.
 */

/** The part of the snapshot these tests read. */
interface BlockPalette {
    states: Record<string, Record<string, string | number>>;
    domains: Record<string, Record<string, { values: (string | number)[]; default: string | number }>>;
}

const snapshots = join(import.meta.dirname, 'snapshot');

/** Every committed capture, by version directory. */
const palettes = readdirSync(snapshots)
    .filter((version) => existsSync(join(snapshots, version, 'block-palette.json')))
    .map(
        (version) =>
            [
                version,
                // Parsed JSON has no type the compiler can see; this is the shape `merge-block-palette.mjs` writes.
                JSON.parse(readFileSync(join(snapshots, version, 'block-palette.json'), 'utf8')) as BlockPalette
            ] as const
    );

describe('block palettes', () => {
    it('are captured for the two releases', () => {
        expect(palettes.map(([version]) => version)).toEqual(expect.arrayContaining(['v2193', 'v2225']));
    });
});

describe.each(palettes)('%s/block-palette.json', (_version, palette) => {
    it('catalogs every block type the game describes', () => {
        // A place pass that ran before its ticking area loaded saves nothing, and the merge still
        // writes whatever the world held.
        expect(Object.keys(palette.domains).filter((name) => !(name in palette.states))).toEqual([]);
    });

    it('catalogs the blocks that need a support block to stand up', () => {
        // Each of these was lost by a place pass that offered only stone and farmland.
        for (const name of ['minecraft:nether_wart', 'minecraft:frog_spawn', 'minecraft:red_mushroom']) {
            expect(Object.keys(palette.states), name).toContain(name);
        }
    });

    it('describes every catalogued block', () => {
        expect(Object.keys(palette.states).filter((name) => !(name in palette.domains))).toEqual([]);
    });

    it('holds a determined value for every property the network carries', () => {
        const undetermined = Object.entries(palette.states).flatMap(([name, states]) =>
            Object.entries(states)
                .filter(([property, value]) => palette.domains[name]?.[property]?.default !== value)
                .map(([property]) => `${name}.${property}`)
        );

        expect(undetermined).toEqual([]);
    });

    it('holds a value the block accepts for every property the network carries', () => {
        const rejected = Object.entries(palette.states).flatMap(([name, states]) =>
            Object.entries(states)
                .filter(([property, value]) => !palette.domains[name]?.[property]?.values.includes(value))
                .map(([property]) => `${name}.${property}`)
        );

        expect(rejected).toEqual([]);
    });
});
