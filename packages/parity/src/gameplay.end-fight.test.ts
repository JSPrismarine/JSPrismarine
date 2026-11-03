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
import { reportParityCases } from './trackerCases.ts';
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

            const crystalMatches =
                numberField(crystalHealth, 'value') === 1 &&
                numberField(crystalHealth, 'max') === 1 &&
                numberField(crystalExplosion, 'power') === 6;
            const dragonMatches =
                numberField(dragonHealth, 'value') === 200 &&
                numberField(dragonHealth, 'max') === 200 &&
                numberField(boss, 'hud_range') === 125 &&
                javaDragon?.attributes['minecraft:max_health'] === 200;
            reportParityCases(FAMILIES.gameplayEndFight, import.meta.filename, [
                {
                    id: 'minecraft:ender_crystal/explosion',
                    title: 'minecraft:ender_crystal',
                    context: 'Vanilla crystal health and explosion data used by the End fight',
                    status: crystalMatches ? 'passed' : 'failed'
                },
                {
                    id: 'minecraft:ender_dragon/health',
                    title: 'minecraft:ender_dragon',
                    context: 'Java max health and vanilla boss data used by the End fight',
                    status: dragonMatches ? 'passed' : 'failed'
                }
            ]);

            expect(numberField(crystalHealth, 'value')).toBe(1);
            expect(numberField(crystalHealth, 'max')).toBe(1);
            expect(numberField(crystalExplosion, 'power')).toBe(6);
            expect(numberField(dragonHealth, 'value')).toBe(200);
            expect(numberField(dragonHealth, 'max')).toBe(200);
            expect(numberField(boss, 'hud_range')).toBe(125);
            expect(javaDragon?.attributes['minecraft:max_health']).toBe(200);
        });

        it('classifies crystals and cushions outside the mob damage path', () => {
            const types = loadVanillaEntityTypes();
            const crystal = types.spawn('minecraft:ender_crystal');
            const cushion = types.spawn('minecraft:cushion');

            expect(crystal.families()).not.toContain('mob');
            expect(cushion.families()).not.toContain('mob');
        });

        it('lets a `/kill` land on the dragon and activate its death hold', () => {
            const types = loadVanillaEntityTypes();
            const dragon = types.spawn('minecraft:ender_dragon');

            // The server's dragon damage rules key on the `dragon` family and admit the
            // `/kill` cause whole; the pack's own damage sensor only zeroes falls, so the
            // blow reaches the health and the death event activates the hold group.
            expect(dragon.families()).toContain('dragon');

            const result = dragon.damage({ cause: 'self_destruct', amount: 200 });
            expect(result).toMatchObject({ amount: 200, died: true });

            dragon.applyQueuedEvents();
            expect(dragon.activeComponentGroups()).toContain('dragon_death');

            // The goal registry is not loaded here, so the behavior is read off the
            // parsed group: it is what tells the server's removal listener to wait the
            // death animation out rather than take the dragon away on the spot.
            const group = types.registry.get('minecraft:ender_dragon')?.entity.componentGroups.get('dragon_death');
            expect(group?.get('minecraft:behavior.dragondeath')).toBeDefined();
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
