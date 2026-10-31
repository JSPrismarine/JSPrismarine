import { describe, expect, it } from 'vitest';

import { BlockStateSchemas } from '../../../block/state/BlockStateSchema';
import { testContent } from '../../../testing/entityServer';
import type { GeneratorLogger } from '../../BaseGenerator';
import { Dimensions } from '../../Dimension';
import type { DimensionType } from '../../Dimension';
import type { GeneratorBuildContext } from '../../GeneratorFactories';
import { GeneratorFactories } from '../../GeneratorFactories';
import { bedrockBiomeIdOf } from '../datadriven/javaTranslation';
import type { DebugGridState } from './debug';
import { DEBUG_GENERATOR_KIND, DebugGenerator, debugGeneratorFactory, debugGridStates } from './debug';

const contextFor = (dimension: DimensionType, logger: GeneratorLogger = quiet()): GeneratorBuildContext => ({
    stem: { type: dimension.id, generator: { type: DEBUG_GENERATOR_KIND } },
    dimension,
    seed: 1n,
    content: testContent,
    worldgen: () => {
        throw new Error('The debug world never reads the Java registries');
    },
    logger
});

const quiet = (): GeneratorLogger => ({ info: () => {}, warn: () => {} });

/**
 * The first `count` states of the shipped catalog, in catalog order, so a grid test has a
 * list every entry of which the chunk can store.
 */
const catalogStates = (count: number): readonly DebugGridState[] => {
    const states: DebugGridState[] = [];
    for (const name of BlockStateSchemas.names()) {
        for (const state of BlockStateSchemas.get(name)!.getAllStates()) {
            if (states.length === count) return states;
            states.push({ name, values: state.properties });
        }
    }
    throw new Error(`The catalog holds fewer than ${count} states`);
};

const generatorOf = (states: readonly DebugGridState[], logger: GeneratorLogger = quiet()): DebugGenerator =>
    new DebugGenerator({ states: () => states, dimension: Dimensions.Overworld, logger });

/** Where Java puts grid index `i` for a grid `width` wide: columns along x, rows along z. */
const cellOf = (index: number, width: number): { x: number; z: number } => ({
    x: 2 * Math.floor(index / width) + 1,
    z: 2 * (index % width) + 1
});

describe('the minecraft:debug factory', () => {
    it('is the kind the registry starts with', () => {
        expect(new GeneratorFactories().kinds()).toContain(DEBUG_GENERATOR_KIND);
    });

    it('lists the content palette in runtime id order: identifiers sorted, then state index', () => {
        expect(debugGridStates(testContent())).toEqual([
            { name: 'minecraft:redstone_lamp', values: { lit: false } },
            { name: 'minecraft:redstone_lamp', values: { lit: true } },
            { name: 'minecraft:stone', values: {} }
        ]);
    });

    it('lays the states out two apart at y 70, z fastest, with ceil(sqrt(count)) per row', async () => {
        const states = catalogStates(37);
        const chunk = await generatorOf(states).generateChunk(0, 0);

        // 37 states: width 7, height 6. Index 7 starts the second column along x.
        for (const index of [0, 1, 6, 7, 20, 36]) {
            const { x, z } = cellOf(index, 7);
            const placed = chunk.getBlock(x, 70, z);
            expect(placed.name, `index ${index}`).toBe(states[index]!.name);
            expect(placed.properties, `index ${index}`).toEqual(states[index]!.values);
        }

        // Index 42 would sit at column 6, row 0, past the last state.
        expect(chunk.getBlock(13, 70, 1).name).toBe('minecraft:air');
        // Even coordinates and the axes are the gaps between cells.
        expect(chunk.getBlock(0, 70, 1).name).toBe('minecraft:air');
        expect(chunk.getBlock(1, 70, 0).name).toBe('minecraft:air');
        expect(chunk.getBlock(2, 70, 1).name).toBe('minecraft:air');
        expect(chunk.getBlock(1, 69, 1).name).toBe('minecraft:air');
        expect(chunk.getBlock(1, 71, 1).name).toBe('minecraft:air');
    });

    it('floors every column with barrier at y 60, beyond the grid and behind the origin too', async () => {
        const generator = generatorOf(catalogStates(4));
        const origin = await generator.generateChunk(0, 0);
        const behind = await generator.generateChunk(-1, -1);

        expect(origin.getBlock(0, 60, 0).name).toBe('minecraft:barrier');
        expect(origin.getBlock(15, 60, 15).name).toBe('minecraft:barrier');
        expect(origin.getBlock(0, 59, 0).name).toBe('minecraft:air');
        expect(origin.getBlock(0, 61, 0).name).toBe('minecraft:air');
        expect(behind.getBlock(15, 60, 15).name).toBe('minecraft:barrier');
        expect(behind.getHighestBlockAt(15, 15)).toBe(60);
    });

    it('tiles the grid across chunks with every state placed exactly once', async () => {
        // 100 states: a 10 by 10 grid spanning x and z 1 to 19, which crosses the chunk edge at 16.
        const states = catalogStates(100);
        const generator = generatorOf(states);
        const found = new Map<number, { x: number; z: number }>();
        const pastTheGrid: { x: number; z: number; index: number }[] = [];

        for (const [cx, cz] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1]
        ] as const) {
            const chunk = await generator.generateChunk(cx, cz);
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    const placed = chunk.getBlock(x, 70, z);
                    if (placed.name === 'minecraft:air') continue;

                    const index = states.findIndex(
                        (state) =>
                            state.name === placed.name &&
                            JSON.stringify(state.values) === JSON.stringify(placed.properties)
                    );
                    const at = { x: cx * 16 + x, z: cz * 16 + z };
                    expect(index, `${placed.name} at ${at.x},${at.z}`).toBeGreaterThanOrEqual(0);
                    if (at.z > 19) {
                        pastTheGrid.push({ ...at, index });
                        continue;
                    }

                    expect(found.has(index), `index ${index} placed twice`).toBe(false);
                    found.set(index, at);
                }
            }
        }

        expect(found.size).toBe(100);
        for (const [index, at] of found) expect(at, `index ${index}`).toEqual(cellOf(index, 10));
        expect([...found.values()].filter((at) => at.x >= 16).length).toBe(20);

        // Java's inclusive bounds keep row 10, whose index `column * 10 + 10` is the next
        // column's first cell. The duplicate row is Java's and is reproduced on purpose.
        expect(pastTheGrid).toEqual(
            Array.from({ length: 9 }, (_, column) => ({ x: 2 * column + 1, z: 21, index: (column + 1) * 10 }))
        );
    });

    it('answers the surface from the grid where a cell stands and from the floor elsewhere', () => {
        const states = catalogStates(4);
        const generator = generatorOf(states);

        expect(generator.surfaceAt(1, 1)).toEqual({ y: 70, name: states[0]!.name });
        expect(generator.surfaceAt(3, 3)).toEqual({ y: 70, name: states[3]!.name });
        expect(generator.surfaceAt(0, 0)).toEqual({ y: 60, name: 'minecraft:barrier' });
        expect(generator.surfaceAt(-7, 3)).toEqual({ y: 60, name: 'minecraft:barrier' });
    });

    it('puts the whole world in plains', async () => {
        const chunk = await generatorOf(catalogStates(1)).generateChunk(2, 2);

        const plains = bedrockBiomeIdOf('minecraft:plains');
        expect(chunk.getBiome(0, -64, 0)).toBe(plains);
        expect(chunk.getBiome(15, 319, 15)).toBe(plains);
    });

    it('builds from the content palette, leaving a state the catalog refuses as air and saying so once', async () => {
        const warnings: string[] = [];
        const logger: GeneratorLogger = { info: () => {}, warn: (...message) => warnings.push(message.join(' ')) };
        const generator = debugGeneratorFactory.build(contextFor(Dimensions.Overworld, logger));
        const chunk = await generator.generateChunk(0, 0);
        await generator.generateChunk(1, 0);

        // Three states: width 2. The fixture lamp's `lit` is not a property of the shipped
        // `minecraft:redstone_lamp`, so its two states have no id; stone is index 2.
        expect(chunk.getBlock(3, 70, 1).name).toBe('minecraft:stone');
        expect(chunk.getBlock(1, 70, 1).name).toBe('minecraft:air');
        expect(chunk.getBlock(1, 70, 3).name).toBe('minecraft:air');
        expect(chunk.getBlock(1, 60, 1).name).toBe('minecraft:barrier');
        expect(generator.surfaceAt?.(1, 1)).toEqual({ y: 60, name: 'minecraft:barrier' });
        expect(warnings).toEqual([
            '2 of 3 palette states have no block state schema and generate as air: minecraft:redstone_lamp[lit=false], minecraft:redstone_lamp[lit=true]'
        ]);
    });

    it('refuses a dimension whose bounds leave no room for the grid', () => {
        const shallow: DimensionType = { ...Dimensions.Nether, minY: 0, height: 64 };

        expect(() => debugGeneratorFactory.build(contextFor(shallow))).toThrowError(
            "minecraft:debug lays its grid at y 60 to 70, outside the minecraft:the_nether stem's y 0 to 63"
        );
    });
});
