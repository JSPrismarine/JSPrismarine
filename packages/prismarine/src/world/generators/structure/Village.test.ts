import { describe, expect, it } from 'vitest';

import * as Blocks from '../../../block/Blocks';
import type { Block } from '../../../block/Block';
import * as Entities from '../../../entity/Entities';
import { Mob } from '../../../entity/Mob';
import type Chunk from '../../chunk/Chunk';
import Noise from '../Noise';
import Overworld from '../Overworld';
import { SEA_LEVEL, surfaceHeightAt } from '../TerrainShape';
import type { StructureOrigin, TerrainSampler } from './Structure';
import VillageStructure from './VillageStructure';

/** A BlockManager stand-in: the generator only ever looks blocks up by name. */
const blockManager: any = {
    getBlock: (name: string) => {
        const found = Object.values(Blocks)
            .map((B) => new (B as any)())
            .find((block: Block) => block.getName() === name);
        if (!found) throw new Error(`invalid block with id ${name}`);
        return found;
    }
};

const SEED = 4242;

const generate = (cx: number, cz: number, seed = SEED) => new Overworld(blockManager).generateChunk(cx, cz, seed);

const sampler = (seed = SEED): TerrainSampler => {
    const noise = new Noise(seed);
    return {
        heightAt: (x, z) => surfaceHeightAt(noise, x, z, -64, 319),
        seaLevel: SEA_LEVEL,
        floor: -64,
        ceiling: 319
    };
};

/**
 * The first village the placement grid actually accepts, found without generating anything.
 *
 * Asking the structure directly rather than sweeping chunks for planks: a village is a pure
 * function of its origin, so this finds the same village the generator will build, in
 * milliseconds instead of the minute a search over a few thousand chunks costs.
 */
const findVillage = (seed = SEED): StructureOrigin => {
    const village = new VillageStructure();
    const terrain = sampler(seed);

    for (let cx = -40; cx <= 40; cx++) {
        for (let cz = -40; cz <= 40; cz++) {
            for (const origin of village.placement.originsNear(cx, cz, seed, village.reach)) {
                if (village.plan(origin, village.placement.randomFor(origin, seed), terrain)) return origin;
            }
        }
    }

    throw new Error('no village anywhere near the origin, which the placement grid should not allow');
};

/** Every block name in a chunk between two heights. */
const namesIn = (chunk: Chunk, lowest = 40, highest = 140): Set<string> => {
    const names = new Set<string>();
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            for (let y = lowest; y <= highest; y++) names.add(chunk.getBlock(x, y, z).name);
        }
    }
    return names;
};

/** The chunks covering a village, and everything in them. */
const aroundVillage = async (origin: StructureOrigin, radius = 3) => {
    const centerX = origin.x >> 4;
    const centerZ = origin.z >> 4;

    const chunks: Chunk[] = [];
    const byKey = new Map<string, Chunk>();

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const chunk = await generate(centerX + dx, centerZ + dz);
            chunks.push(chunk);
            byKey.set(`${centerX + dx},${centerZ + dz}`, chunk);
        }
    }

    const names = new Set<string>();
    for (const chunk of chunks) for (const name of namesIn(chunk)) names.add(name);

    /**
     * A block by world coordinates, across the whole generated area.
     *
     * Needed because a village straddles chunks: anything that looks at a building as a whole has
     * to be able to read across a border, and a chunk-local lookup silently wraps to the far side
     * of the same chunk instead.
     */
    const blockAt = (x: number, y: number, z: number): string =>
        byKey.get(`${x >> 4},${z >> 4}`)?.getBlock(x & 0xf, y, z & 0xf).name ?? 'minecraft:air';

    return { chunks, names, blockAt, centerX, centerZ };
};

describe('village generation', () => {
    it('builds a village where the placement grid says one goes', async () => {
        const { names } = await aroundVillage(findVillage());

        // A village is streets, a well, and houses with doors and windows in them.
        for (const block of [
            'minecraft:grass_path',
            'minecraft:cobblestone',
            'minecraft:oak_planks',
            'minecraft:oak_stairs',
            'minecraft:wooden_door',
            'minecraft:glass_pane',
            'minecraft:torch',
            'minecraft:bed',
            'minecraft:farmland',
            'minecraft:wheat'
        ]) {
            expect([...names]).toContain(block);
        }
    }, 60_000);

    it('generates the same village however often a chunk is generated', async () => {
        // The whole approach rests on this. Each chunk plans the village independently, so two
        // runs that disagreed anywhere would mean a house with two different roofs.
        const origin = findVillage();
        const [cx, cz] = [origin.x >> 4, origin.z >> 4];

        const first = await generate(cx, cz);
        const second = await generate(cx, cz);

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 40; y < 130; y++) {
                    expect(second.getBlock(x, y, z).name).toBe(first.getBlock(x, y, z).name);
                }
            }
        }
    }, 60_000);

    it('does not depend on which chunk is generated first', async () => {
        // Generating the far corner of a village before its middle must give the same world as the
        // other way round - chunks have no access to their neighbours, and this is what proves it
        // is not accidentally relying on one.
        const origin = findVillage();
        const [cx, cz] = [origin.x >> 4, origin.z >> 4];

        const forwards = await generate(cx + 2, cz + 2);
        await generate(cx, cz);
        const backwards = await generate(cx + 2, cz + 2);

        for (let x = 0; x < 16; x += 2) {
            for (let z = 0; z < 16; z += 2) {
                for (let y = 40; y < 130; y += 3) {
                    expect(backwards.getBlock(x, y, z).name).toBe(forwards.getBlock(x, y, z).name);
                }
            }
        }
    }, 60_000);

    it('carries buildings across chunk borders instead of slicing them off', async () => {
        // A wall running into a chunk border must continue on the other side. If the two chunks
        // planned the village differently, or one of them clipped it early, the neighbouring
        // column would be untouched terrain instead.
        const origin = findVillage();
        const [cx, cz] = [origin.x >> 4, origin.z >> 4];

        let seams = 0;
        for (let dx = -3; dx <= 2; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                const left = await generate(cx + dx, cz + dz);
                const right = await generate(cx + dx + 1, cz + dz);

                for (let z = 0; z < 16; z++) {
                    for (let y = 50; y < 110; y++) {
                        if (left.getBlock(15, y, z).name !== 'minecraft:oak_planks') continue;

                        seams++;
                        expect(right.getBlock(0, y, z).name).not.toBe('minecraft:stone');
                    }
                }
            }
        }

        // The seam has to have been exercised, or the test proved nothing.
        expect(seams).toBeGreaterThan(0);
    }, 60_000);

    it('records each villager exactly once, in the chunk it stands in', async () => {
        // Every chunk a village covers draws the whole village, so a spawn recorded without
        // checking which chunk it falls in would give a five house village sixty villagers.
        const origin = findVillage();
        const { chunks } = await aroundVillage(origin, 4);

        const seen = new Map<string, number>();
        let villagers = 0;

        for (const chunk of chunks) {
            for (const spawn of chunk.getEntitySpawns()) {
                const key = `${spawn.type}@${spawn.x},${spawn.y},${spawn.z}`;
                seen.set(key, (seen.get(key) ?? 0) + 1);
                if (spawn.type === 'minecraft:villager_v2') villagers++;

                expect(Math.floor(spawn.x) >> 4).toBe(chunk.getX());
                expect(Math.floor(spawn.z) >> 4).toBe(chunk.getZ());
            }
        }

        expect(villagers).toBeGreaterThan(4);
        for (const [key, count] of seen) expect(`${key} x${count}`).toBe(`${key} x1`);
    }, 60_000);

    it('asks for mobs that can actually think', async () => {
        // A village populated by entity classes with no behaviour attached would look right and be
        // a village of statues. The trap is real: `minecraft:villager` still resolves, to the
        // legacy class kept for reading old worlds, which has no AI - the modern one is
        // `minecraft:villager_v2`.
        const origin = findVillage();
        const { chunks } = await aroundVillage(origin, 4);

        const wanted = new Set(chunks.flatMap((chunk) => chunk.getEntitySpawns().map((spawn) => spawn.type)));
        expect(wanted.size).toBeGreaterThan(0);

        for (const type of wanted) {
            const Species = Object.values(Entities).find((candidate) => candidate.MOB_ID === type);
            expect(`${type} -> ${Species?.name ?? 'nothing'}`).toBe(`${type} -> ${Species?.name}`);
            expect(Species!.prototype).toBeInstanceOf(Mob);
        }
    }, 60_000);

    it('puts a villager in a house rather than inside a wall', async () => {
        const origin = findVillage();
        const { chunks } = await aroundVillage(origin, 4);

        let checked = 0;
        for (const chunk of chunks) {
            for (const spawn of chunk.getEntitySpawns()) {
                const x = Math.floor(spawn.x) & 0xf;
                const z = Math.floor(spawn.z) & 0xf;
                const y = Math.floor(spawn.y);

                // Two blocks of air to stand in, and something solid underfoot.
                expect(chunk.getBlock(x, y, z).name).toBe('minecraft:air');
                expect(chunk.getBlock(x, y + 1, z).name).toBe('minecraft:air');
                expect(chunk.getBlock(x, y - 1, z).name).not.toBe('minecraft:air');
                checked++;
            }
        }

        expect(checked).toBeGreaterThan(0);
    }, 60_000);

    it('leaves the rest of the world alone', async () => {
        // Villages are rare by design. If most chunks had one, either the placement grid or the
        // terrain test would be broken, and both are easy to break without noticing.
        let withVillage = 0;
        const side = 12;

        for (let cx = 0; cx < side; cx++) {
            for (let cz = 0; cz < side; cz++) {
                if (namesIn(await generate(cx, cz, 99)).has('minecraft:oak_planks')) withVillage++;
            }
        }

        expect(withVillage).toBeLessThan(side * side * 0.4);
    }, 60_000);
});
