import { item_table as items2193 } from '@jsprismarine/bedrock-data';
import { item_table as items2225 } from '@jsprismarine/bedrock-data/v2225';
import {
    createTestOracle,
    endPodium,
    endSpikesForSeed,
    TestFeatureWorld,
    WorldgenRandom
} from '@jsprismarine/features';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { loadActorIdentifiers, loadJavaEntityAttributes } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { loadVanillaEntityTypes } from './vanillaEntities.ts';

/** Reads a numeric field from one of Mojang's parsed component records. */
const numberField = (value: unknown, name: string): number | undefined => {
    if (typeof value !== 'object' || value === null || !(name in value)) return undefined;
    const field: unknown = Reflect.get(value, name);
    return typeof field === 'number' ? field : undefined;
};

describeFamily(
    FAMILIES.gameplayEndFight,
    [REFERENCES.bedrockBehaviorPack, REFERENCES.javaEntityAttributes, REFERENCES.bedrockActorIdentifiers],
    () => {
        it('carries the crystal and dragon values the fight uses', () => {
            const types = loadVanillaEntityTypes();
            const crystal = types.registry.get('minecraft:ender_crystal');
            const dragon = types.registry.get('minecraft:ender_dragon');
            const crystalHealth = crystal?.entity.components.get('minecraft:health');
            const crystalExplosion = crystal?.entity.componentGroups.get('crystal_exploding')?.get('minecraft:explode');
            const dragonHealth = dragon?.entity.components.get('minecraft:health');
            const boss = dragon?.entity.components.get('minecraft:boss');
            const javaDragon = loadJavaEntityAttributes()['minecraft:ender_dragon'];

            expect(numberField(crystalHealth, 'value')).toBe(1);
            expect(numberField(crystalHealth, 'max')).toBe(1);
            expect(numberField(crystalExplosion, 'power')).toBe(6);
            expect(numberField(dragonHealth, 'value')).toBe(200);
            expect(numberField(dragonHealth, 'max')).toBe(200);
            expect(numberField(boss, 'hud_range')).toBe(125);
            expect(javaDragon?.attributes['minecraft:max_health']).toBe(200);
        });

        it('keeps crystal item ids, actor ids, and Java-to-Bedrock entity names aligned', () => {
            expect(items2193['minecraft:end_crystal']?.runtime_id).toBe(851);
            expect(items2225['minecraft:end_crystal']?.runtime_id).toBe(852);

            const actors = new Map(loadActorIdentifiers().map((actor) => [actor.id, actor.rid]));
            expect(actors.get('minecraft:ender_crystal')).toBe(71);
            expect(actors.get('minecraft:ender_dragon')).toBe(53);

            const crystal = javaEntityTypeToBedrock('minecraft:end_crystal');
            const dragon = javaEntityTypeToBedrock('minecraft:ender_dragon');
            expect(crystal).toMatchObject({ kind: 'mapped', bedrock: 'minecraft:ender_crystal' });
            expect(dragon).toMatchObject({ kind: 'mapped', bedrock: 'minecraft:ender_dragon' });
        });

        it('derives the ten seed-1234 spikes from Java’s angle and shuffled-index formulas', () => {
            const spikes = endSpikesForSeed(1234n);
            expect(spikes.map((spike) => spike.height)).toEqual([97, 103, 82, 91, 100, 94, 79, 88, 76, 85]);

            for (const [index, spike] of spikes.entries()) {
                const shuffledIndex = (spike.height - 76) / 3;
                const angle = 2 * (-Math.PI + 0.3141592653589793 * index);

                expect(spike.centerX).toBe(Math.floor(42 * Math.cos(angle)));
                expect(spike.centerZ).toBe(Math.floor(42 * Math.sin(angle)));
                expect(spike.radius).toBe(2 + Math.floor(shuffledIndex / 3));
                expect(spike.guarded).toBe(shuffledIndex === 1 || shuffledIndex === 2);
            }
        });

        it('places the active exit podium with sixteen rim cells and twenty portal cells', () => {
            const world = new TestFeatureWorld({ minY: 0, height: 256, blocks: createTestOracle() });
            endPodium(true).place(world, new WorldgenRandom(9n), { x: 0, y: 64, z: 0 });

            const rim = world
                .positionsOf('minecraft:bedrock')
                .filter((position) => position.y === 64 && (position.x !== 0 || position.z !== 0));
            expect(rim).toHaveLength(16);
            expect(world.count('minecraft:end_portal')).toBe(20);
        });
    },
    { tags: ['real-data'] }
);
