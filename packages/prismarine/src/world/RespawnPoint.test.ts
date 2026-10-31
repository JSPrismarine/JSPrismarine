import { describe, expect, it } from 'vitest';

import { Dimensions } from './DimensionType';
import { isRespawnBlock, resolveRespawn, respawnBlockWorksIn } from './RespawnPoint';
import type { RespawnTerrain } from './RespawnPoint';

/** A world of named blocks, with everything not named here being air. */
const terrainOf = (blocks: Readonly<Record<string, string>>): RespawnTerrain => ({
    minY: -64,
    maxY: 320,
    getBlockName: async (x, y, z) => blocks[`${x},${y},${z}`] ?? 'minecraft:air',
    isObstructed: async (x, y, z) => (blocks[`${x},${y},${z}`] ?? 'minecraft:air') !== 'minecraft:air'
});

const BED = { x: 10, y: 64, z: 10, dimension: 'minecraft:overworld' };

describe('a per-player spawn point', () => {
    it('knows the blocks that hold one', () => {
        expect(isRespawnBlock('minecraft:bed')).toBe(true);
        expect(isRespawnBlock('minecraft:red_bed')).toBe(true);
        expect(isRespawnBlock('minecraft:respawn_anchor')).toBe(true);
        expect(isRespawnBlock('minecraft:chest')).toBe(false);
        expect(isRespawnBlock('minecraft:bedrock')).toBe(false);
    });

    it('lets a bed set a spawn only where the dimension type allows one, and an anchor only where it works', () => {
        // Java's `bed_rule.can_set_spawn` and `respawn_anchor_works` environment attributes, as
        // the 26.3 `dimension_type` documents set them: a bed in the Overworld, an anchor in the
        // Nether, neither in the End.
        const attributesOf = (dimension: keyof typeof Dimensions) => Dimensions[dimension].java.attributes;

        expect(respawnBlockWorksIn('minecraft:red_bed', attributesOf('Overworld'))).toBe(true);
        expect(respawnBlockWorksIn('minecraft:bed', attributesOf('Nether'))).toBe(false);
        expect(respawnBlockWorksIn('minecraft:bed', attributesOf('TheEnd'))).toBe(false);

        expect(respawnBlockWorksIn('minecraft:respawn_anchor', attributesOf('Overworld'))).toBe(false);
        expect(respawnBlockWorksIn('minecraft:respawn_anchor', attributesOf('Nether'))).toBe(true);
        expect(respawnBlockWorksIn('minecraft:respawn_anchor', attributesOf('TheEnd'))).toBe(false);

        expect(respawnBlockWorksIn('minecraft:chest', attributesOf('Overworld'))).toBe(false);
    });

    it('reads a custom dimension type with no bed rule as the Overworld, and one with no anchor flag as refusing it', () => {
        // Java's defaults for the two attributes, which a datapack type that leaves them out gets.
        expect(respawnBlockWorksIn('minecraft:bed', new Map())).toBe(true);
        expect(respawnBlockWorksIn('minecraft:respawn_anchor', new Map())).toBe(false);
    });

    it('stands the player beside the bed rather than in it', async () => {
        const resolved = await resolveRespawn(BED, terrainOf({ '10,64,10': 'minecraft:red_bed' }));

        expect(resolved.kind).toBe('honored');
        if (resolved.kind !== 'honored') return;
        // The first free column of the eight around it, which is the one to the north.
        expect([resolved.position.getX(), resolved.position.getY(), resolved.position.getZ()]).toEqual([10, 64, 11]);
    });

    it('gives up on a bed that is gone, which is Java answering with the world spawn', async () => {
        expect((await resolveRespawn(BED, terrainOf({}))).kind).toBe('destroyed');
        expect((await resolveRespawn(BED, terrainOf({ '10,64,10': 'minecraft:stone' }))).kind).toBe('destroyed');
    });

    it('gives up on a bed walled in on every side, the same way', async () => {
        const walls: Record<string, string> = { '10,64,10': 'minecraft:red_bed' };
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dz = -1; dz <= 1; dz += 1) {
                walls[`${10 + dx},64,${10 + dz}`] ??= 'minecraft:stone';
            }
        }

        expect((await resolveRespawn(BED, terrainOf(walls))).kind).toBe('destroyed');
    });

    it('steps over a column whose head space is blocked', async () => {
        const resolved = await resolveRespawn(
            BED,
            terrainOf({
                '10,64,10': 'minecraft:red_bed',
                // The first candidate column has a ceiling one block up, so the head does not fit.
                '10,65,11': 'minecraft:stone'
            })
        );

        expect(resolved.kind).toBe('honored');
        if (resolved.kind !== 'honored') return;
        expect([resolved.position.getX(), resolved.position.getZ()]).toEqual([10, 9]);
    });

    it('uses a point /spawnpoint set whatever is standing there', async () => {
        const forced = { ...BED, forced: true };
        const resolved = await resolveRespawn(forced, terrainOf({ '10,64,10': 'minecraft:stone' }));

        expect(resolved.kind).toBe('honored');
        if (resolved.kind !== 'honored') return;
        expect([resolved.position.getX(), resolved.position.getY(), resolved.position.getZ()]).toEqual([10, 64, 10]);
    });
});
