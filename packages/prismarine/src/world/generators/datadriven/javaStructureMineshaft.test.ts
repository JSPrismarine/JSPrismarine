/**
 * The abandoned mineshaft, laid out and written against a world made of stone.
 *
 * Nothing here reads Mojang's data. The level is a flat stone column with a known surface and
 * the writer is a map, so what the test asserts is the shape of Java's algorithm rather than
 * whatever the real terrain happens to produce under one seed.
 */
import type { BlockEntityRequest, BlockState } from '@jsprismarine/features';
import { createLegacyRandom } from '@jsprismarine/structures';
import { describe, expect, it } from 'vitest';

import { buildMineshaft, mineshaftPieceDepth } from './javaStructureMineshaft';
import type { StructureBuildContext, StructureLayout } from './javaStructureStarts';
import type { StructureLevel, StructurePiece, StructureWriter } from './javaStructureWorld';

const AIR: BlockState = { name: 'minecraft:air', properties: {} };
const STONE: BlockState = { name: 'minecraft:stone', properties: {} };

/** The surface of the test world: stone up to here, air above it. */
const SURFACE_Y = 72;

/** The blocks the mineshaft may overwrite, which is what the writer's tag lookup answers. */
const REPLACEABLE = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:water']);

/** A world with no terrain shape at all, so a layout's y comes from the settle rule alone. */
const flatLevel: StructureLevel = {
    minY: -64,
    height: 384,
    seaLevel: 63,
    baseHeight: () => SURFACE_Y,
    baseBlock: (_x, y) => (y < SURFACE_Y ? STONE : AIR),
    noiseBiome: () => 'minecraft:plains'
};

/** The templates a mineshaft never asks for: it is built from code, not from `.nbt` files. */
const noTemplates = {
    template: () => undefined,
    prepared: () => undefined,
    size: () => undefined,
    processors: () => []
};

const contextFor = (seed: bigint, variant: 'normal' | 'mesa'): StructureBuildContext => ({
    id: variant === 'mesa' ? 'minecraft:mineshaft_mesa' : 'minecraft:mineshaft',
    definition: { type: 'minecraft:mineshaft', mineshaft_type: variant },
    chunkX: 3,
    chunkZ: -5,
    seed,
    random: createLegacyRandom(seed),
    level: flatLevel,
    templates: noTemplates,
    pool: () => undefined
});

interface Recording {
    readonly writer: StructureWriter;
    /** Every block the pieces wrote, keyed by position. */
    readonly blocks: Map<string, BlockState>;
    readonly entities: BlockEntityRequest[];
    /** The identifiers that reached the writer, which is what most assertions read. */
    names(): Set<string>;
}

/** A writer with no chunk clip, so one call places the whole mineshaft. */
const recordingWriter = (): Recording => {
    const blocks = new Map<string, BlockState>();
    const entities: BlockEntityRequest[] = [];
    const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

    const writer: StructureWriter = {
        level: flatLevel,
        blockAt: (x, y, z) => blocks.get(key(x, y, z)) ?? flatLevel.baseBlock(x, y, z),
        setBlock: (x, y, z, state) => {
            blocks.set(key(x, y, z), state);
            return true;
        },
        setBedrockBlock: () => false,
        setBlockEntity: (_x, _y, _z, request) => {
            entities.push(request);
        },
        spawnEntity: () => {},
        heightAt: (heightmap, x, z) => flatLevel.baseHeight(x, z, heightmap),
        hasTag: (identifier, tag) => tag === 'minecraft:replaceable' && REPLACEABLE.has(identifier)
    };

    return {
        writer,
        blocks,
        entities,
        names: () => new Set([...blocks.values()].map((state) => state.name))
    };
};

/** Writes a laid-out mineshaft once, the way one chunk writes the part of it that it holds. */
const placeAll = (layout: Mineshaft, seed: bigint): Recording => {
    const recording = recordingWriter();
    const random = createLegacyRandom(seed);
    for (const piece of layout.pieces) piece.place(recording.writer, random);
    return recording;
};

/** The boxes of a layout, which is what two seeds are compared on. */
const shapeOf = (layout: Mineshaft): string =>
    layout.pieces.map((piece) => JSON.stringify(piece.boundingBox)).join('|');

const overlaps = (a: StructurePiece, b: StructurePiece): boolean => {
    const first = a.boundingBox;
    const second = b.boundingBox;
    return (
        first.minX <= second.maxX &&
        first.maxX >= second.minX &&
        first.minY <= second.maxY &&
        first.maxY >= second.minY &&
        first.minZ <= second.maxZ &&
        first.maxZ >= second.minZ
    );
};

/** One mineshaft laid out, with its deferred pieces assembled once. */
interface Mineshaft {
    readonly origin: StructureLayout['origin'];
    readonly pieces: readonly StructurePiece[];
}

const layoutFor = (seed: bigint, variant: 'normal' | 'mesa' = 'normal'): Mineshaft => {
    const layout = buildMineshaft(contextFor(seed, variant));
    if (layout === undefined) throw new Error(`seed ${seed} laid out no mineshaft`);

    return { origin: layout.origin, pieces: layout.pieces() };
};

describe('buildMineshaft', () => {
    it('chains tunnels off the room and stops at the depth limit', () => {
        const layout = layoutFor(1234n);
        const depths = layout.pieces.map((piece) => mineshaftPieceDepth(piece));

        // The room is the first piece, the tunnels that chain off it are the rest, and Java's
        // limit of eight calls deep puts the last piece it builds at nine.
        expect(layout.pieces.length).toBeGreaterThan(10);
        expect(depths[0]).toBe(0);
        expect(Math.max(...depths.map((depth) => depth ?? -1))).toBe(9);
        expect(depths.every((depth) => depth !== undefined && depth <= 9)).toBe(true);
    });

    it('keeps every piece out of every other piece', () => {
        for (const seed of [1234n, 99n, 2026n]) {
            const pieces = layoutFor(seed).pieces;
            for (let i = 0; i < pieces.length; i++) {
                for (let j = i + 1; j < pieces.length; j++) {
                    expect(overlaps(pieces[i]!, pieces[j]!)).toBe(false);
                }
            }
        }
    });

    it('settles the whole shaft to one height while it lays out', () => {
        const layout = layoutFor(1234n);
        const tops = layout.pieces.map((piece) => piece.boundingBox.maxY);

        // `moveBelowSeaLevel` puts the ceiling at least ten blocks under the sea and keeps the
        // floor inside the dimension.
        expect(Math.max(...tops)).toBeLessThanOrEqual(flatLevel.seaLevel - 10);
        expect(Math.min(...layout.pieces.map((piece) => piece.boundingBox.minY))).toBeGreaterThan(flatLevel.minY);
        expect(layout.origin.y).toBeLessThan(flatLevel.seaLevel);
    });

    it('hangs the mesa variant between the sea and the surface', () => {
        const layout = layoutFor(1234n, 'mesa');
        const low = Math.min(...layout.pieces.map((piece) => piece.boundingBox.minY));
        const high = Math.max(...layout.pieces.map((piece) => piece.boundingBox.maxY));

        // The mesa rule lifts the middle of the whole shaft to a drawn y between sea level and
        // the terrain over it, which puts the top of it above the water line.
        const middle = low + Math.trunc((high - low + 1) / 2);
        expect(middle).toBeGreaterThanOrEqual(flatLevel.seaLevel);
        expect(middle).toBeLessThanOrEqual(SURFACE_Y);
        expect(high).toBeGreaterThan(flatLevel.seaLevel);
    });

    it('writes the rails, the supports and the cobwebs', () => {
        const names = placeAll(layoutFor(1234n), 55n).names();

        expect(names).toContain('minecraft:rail');
        expect(names).toContain('minecraft:oak_fence');
        expect(names).toContain('minecraft:oak_planks');
        expect(names).toContain('minecraft:cobweb');
        expect(names).toContain('minecraft:cave_air');
    });

    it('builds the mesa variant out of dark oak', () => {
        const normal = placeAll(layoutFor(1234n, 'normal'), 55n).names();
        const mesa = placeAll(layoutFor(1234n, 'mesa'), 55n).names();

        expect(normal).toContain('minecraft:oak_fence');
        expect(normal).not.toContain('minecraft:dark_oak_fence');
        expect(mesa).toContain('minecraft:dark_oak_fence');
        expect(mesa).toContain('minecraft:dark_oak_planks');
        expect(mesa).not.toContain('minecraft:oak_fence');
        expect(mesa).not.toContain('minecraft:oak_planks');
    });

    it('rolls the mineshaft loot table in a chest and the spider in a spawner', () => {
        const entities = placeAll(layoutFor(1234n), 55n).entities;
        const chests = entities.filter((entity) => entity.id === 'minecraft:chest');
        const spawners = entities.filter((entity) => entity.id === 'minecraft:mob_spawner');

        expect(chests.length).toBeGreaterThan(0);
        expect(chests.every((chest) => chest.lootTable === 'minecraft:chests/abandoned_mineshaft')).toBe(true);
        expect(spawners.length).toBeGreaterThan(0);
        expect(spawners.every((spawner) => spawner.spawnEntity === 'minecraft:cave_spider')).toBe(true);
    });

    it('repeats a seed and moves with a new one', () => {
        expect(shapeOf(layoutFor(1234n))).toBe(shapeOf(layoutFor(1234n)));
        expect(shapeOf(layoutFor(1234n))).not.toBe(shapeOf(layoutFor(4321n)));
    });
});
