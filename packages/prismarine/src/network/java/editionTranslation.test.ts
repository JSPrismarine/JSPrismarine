import { BEDROCK_ONLY_BLOCKS } from '@jsprismarine/mapping';
import { BLOCK_STATES } from '@jsprismarine/protocol/java/versions/26.3/blockStates';
import { ENTITY_TYPES } from '@jsprismarine/protocol/java/versions/26.3/registries';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { EditionTranslation } from './editionTranslation';
import {
    cachedTranslation,
    JAVA_BIOMES,
    javaBiomeTranslation,
    javaBlockTranslation,
    javaEntityTranslation
} from './editionTranslation';

describe('javaBlockTranslation', () => {
    const blocks = javaBlockTranslation();

    it('turns a Bedrock state into the Java state it came from, and back', () => {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');

        expect(blocks.toJava(stone)).toBe(BLOCK_STATES.idOf('minecraft:stone'));
        expect(blocks.toBedrock(BLOCK_STATES.idOf('minecraft:stone')!)).toBe(stone);
    });

    it('carries the properties both ways', () => {
        const java = BLOCK_STATES.idOf('minecraft:oak_stairs', {
            facing: 'east',
            half: 'top',
            shape: 'straight',
            waterlogged: 'false'
        })!;

        expect(blocks.toJava(blocks.toBedrock(java))).toBe(java);
    });

    it('sends a Bedrock-only block as stone, and takes an id Java does not have as air', () => {
        const bedrockOnly = [...BEDROCK_ONLY_BLOCKS]
            .map((name) => BlockRuntimeIds.tryGetByName(name))
            .find((id) => id !== null)!;

        expect(blocks.toJava(bedrockOnly)).toBe(BLOCK_STATES.idOf('minecraft:stone'));
        expect(blocks.toBedrock(BLOCK_STATES.size)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
    });
});

describe('javaBiomeTranslation', () => {
    it("turns plains into the configured registry's plains, and back", () => {
        const biomes = javaBiomeTranslation();
        const javaPlains = JAVA_BIOMES.indexOf('minecraft:plains');

        expect(biomes.toJava(biomes.toBedrock(javaPlains))).toBe(javaPlains);
        expect(JAVA_BIOMES[biomes.toJava(biomes.toBedrock(JAVA_BIOMES.indexOf('minecraft:desert')))]).toBe(
            'minecraft:desert'
        );
    });
});

describe('javaEntityTranslation', () => {
    it('turns a Bedrock entity type into the Java type it comes from, and back', () => {
        const entities = javaEntityTranslation();

        for (const type of ['minecraft:cow', 'minecraft:player', 'minecraft:zombie']) {
            const java = entities.toJava(type);
            expect(ENTITY_TYPES.nameOf(java!)).toBe(type);
            expect(entities.toBedrock(java)).toBe(type);
        }
        expect(entities.toJava('minecraft:agent')).toBeUndefined();
    });
});

describe('cachedTranslation', () => {
    it('looks each value up once in each direction', () => {
        const lookups: string[] = [];
        const doubling: EditionTranslation<number, number> = {
            toJava: (value) => {
                lookups.push(`java ${value}`);
                return value * 2;
            },
            toBedrock: (value) => {
                lookups.push(`bedrock ${value}`);
                return value / 2;
            }
        };
        const cached = cachedTranslation(doubling);

        expect([cached.toJava(3), cached.toJava(3), cached.toBedrock(6), cached.toBedrock(6)]).toEqual([6, 6, 3, 3]);
        expect(lookups).toEqual(['java 3', 'bedrock 6']);
    });
});
