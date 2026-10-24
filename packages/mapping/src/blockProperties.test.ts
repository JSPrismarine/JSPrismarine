import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    BEDROCK_ONLY_BLOCKS,
    BLOCK_PROPERTY_CONFLICTS,
    BLOCK_PROPERTY_VERSIONS,
    bedrockBlockPropertiesOf
} from './blockProperties';
import blockPropertiesJson from './tables/blockProperties.json';

const packageDir = dirname(fileURLToPath(import.meta.url));

// The pinned BDS palette capture; parsed JSON, shape documented in the generator.
const palette = JSON.parse(
    readFileSync(join(packageDir, '../../minecraft/datagen/snapshot/block-palette.json'), 'utf8')
) as { minecraftVersion: string; states: Record<string, string[]> };

// The committed table; parsed JSON, shape documented in blockProperties.ts.
const table = blockPropertiesJson as unknown as {
    blocks: Record<string, { base: Record<string, unknown> }>;
    bedrockOnly: string[];
};

describe('the flattened block property table', () => {
    it('pins the version pair the goldens were dumped from', () => {
        expect(BLOCK_PROPERTY_VERSIONS.javaVersion).toBe('26.3');
        expect(BLOCK_PROPERTY_VERSIONS.bedrockVersion).toBe(palette.minecraftVersion);
    });

    it('partitions the pinned Bedrock palette into Java-sourced rows and the exception list', () => {
        const covered = new Set(Object.keys(table.blocks));
        for (const name of Object.keys(palette.states)) {
            expect(covered.has(name) !== BEDROCK_ONLY_BLOCKS.has(name), name).toBe(true);
        }
        for (const name of covered) expect(name in palette.states, name).toBe(true);
    });

    it('keeps the Bedrock-only exception list to the reviewed identifiers', () => {
        // The chemistry set is the bulk of the list; everything in it is a Bedrock-only family.
        expect(BEDROCK_ONLY_BLOCKS.size).toBe(182);
        for (const name of ['minecraft:element_0', 'minecraft:allow', 'minecraft:deny', 'minecraft:border_block']) {
            expect(BEDROCK_ONLY_BLOCKS.has(name), name).toBe(true);
            expect(bedrockBlockPropertiesOf(name)).toBeUndefined();
        }
    });

    it('limits collapse disagreements to Java properties Bedrock does not represent', () => {
        // Piston extension, leaf distance, bamboo and plant stage: the mapping loss list explains
        // each collapse. Anything new here is a flattening regression to review.
        expect(BLOCK_PROPERTY_CONFLICTS.length).toBe(39);
        for (const conflict of BLOCK_PROPERTY_CONFLICTS) {
            expect(['lightDampening', 'randomTick']).toContain(conflict.field);
        }
        const blocks = new Set(BLOCK_PROPERTY_CONFLICTS.map((conflict) => conflict.bedrock.split('[')[0]));
        expect(blocks.size).toBe(23);
    });
});

describe('bedrockBlockPropertiesOf', () => {
    it('holds the Java jar dump values', () => {
        expect(bedrockBlockPropertiesOf('minecraft:stone')).toMatchObject({
            hardness: 1.5,
            blastResistance: 6,
            requiresCorrectTool: true
        });
        expect(bedrockBlockPropertiesOf('minecraft:obsidian')).toMatchObject({
            hardness: 50,
            blastResistance: 1200,
            pushReaction: 'immoveable'
        });
        expect(bedrockBlockPropertiesOf('minecraft:bedrock')).toMatchObject({
            hardness: -1,
            blastResistance: 3600000
        });
        // The value Bedrock's component grammar cannot hold, and the reason the table is
        // this project's own shape.
        expect(bedrockBlockPropertiesOf('minecraft:blue_ice')?.friction).toBe(0.989);
        expect(bedrockBlockPropertiesOf('minecraft:glowstone')?.lightEmission).toBe(15);
        expect(bedrockBlockPropertiesOf('minecraft:wheat')?.randomTick).toBe(true);
        expect(bedrockBlockPropertiesOf('minecraft:oak_planks')).toMatchObject({ igniteOdds: 5, burnOdds: 20 });
    });

    it('resolves per-state overrides from the Bedrock state values', () => {
        // A fully grown crop stops ticking.
        expect(bedrockBlockPropertiesOf('minecraft:wheat', { growth: 7 })?.randomTick).toBe(false);
        expect(bedrockBlockPropertiesOf('minecraft:wheat', { growth: 3 })?.randomTick).toBe(true);
        // A lit candle emits; palette booleans travel as 0 and 1, engine booleans fold down.
        expect(bedrockBlockPropertiesOf('minecraft:candle', { candles: 0, lit: 1 })?.lightEmission).toBe(3);
        expect(bedrockBlockPropertiesOf('minecraft:candle', { candles: 3, lit: true })?.lightEmission).toBe(12);
        expect(bedrockBlockPropertiesOf('minecraft:candle', { candles: 0, lit: 0 })?.lightEmission).toBe(0);
    });

    it('keys the lit redstone ore split the way Bedrock splits it', () => {
        expect(bedrockBlockPropertiesOf('minecraft:redstone_ore')).toMatchObject({
            lightEmission: 0,
            randomTick: false
        });
        expect(bedrockBlockPropertiesOf('minecraft:lit_redstone_ore')).toMatchObject({
            lightEmission: 9,
            randomTick: true
        });
    });

    it('takes the dry row where Bedrock waterlogs through the second layer, the wet one where it cannot', () => {
        // A fence's own light dampening is 0; the wet Java twin folds the water's 1 in and is dropped.
        expect(bedrockBlockPropertiesOf('minecraft:acacia_fence')?.lightDampening).toBe(0);
        // The sea pickle only glows underwater, and Bedrock gives its wet states their own palette
        // entries, so the wet rows survive.
        expect(bedrockBlockPropertiesOf('minecraft:sea_pickle', { cluster_count: 3, dead_bit: 0 })?.lightEmission).toBe(
            15
        );
        expect(bedrockBlockPropertiesOf('minecraft:sea_pickle', { cluster_count: 3, dead_bit: 1 })?.lightEmission).toBe(
            0
        );
    });
});
