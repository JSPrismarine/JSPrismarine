/**
 * The player systems over a store player: the same survival rules a legacy player runs, written
 * through logged component fields and run from the entity pass, reading loaded chunks only.
 * Asserted as health, component values and change log entries.
 */
import { AIR_STATE } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { fieldsOf, logged, storePlayerFixture } from '../../testing/storePlayer.test.helper';
import type { DataEntity } from './DataEntity';
import type { EntityFixture } from './testing';
import { FLOOR_Y, TestEntityWorld } from './testing';

/** A store player standing on the fixture's floor, and its components. */
const standingPlayer = (fixture: EntityFixture, at = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 }) => {
    const player = fixture.runtime.spawn(PLAYER_IDENTIFIER, at)!;
    return { player, components: fixture.runtime.playerSystems.componentsOf(player) };
};

const healthOf = (entity: DataEntity) => entity.instance.attributes.get('health')?.current;

/** The block a store player standing on the floor has its eyes in. */
const HEAD = { x: 0, y: FLOOR_Y + 2, z: 0 };

/** Ticks the runtime `count` times from `from`, inside one logged tick each, and returns every entry. */
const ticks = (fixture: EntityFixture, count: number, from = 1) => {
    const entries = [];
    for (let tick = from; tick < from + count; tick += 1)
        entries.push(...logged(fixture.runtime, () => fixture.runtime.tick(tick)));
    return entries;
};

describe('a store player', () => {
    describe('hunger', () => {
        it('starves on the four-second clock with an empty bar, through the damage pipeline', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            components.set('vitals.food', 0);

            const quiet = logged(fixture.runtime, () => fixture.runtime.tick(79));
            expect(healthOf(player)).toBe(20);
            expect(fieldsOf(quiet, 'attribute:health')).toHaveLength(0);

            const starved = logged(fixture.runtime, () => fixture.runtime.tick(80));
            expect(healthOf(player)).toBe(19);
            expect(fieldsOf(starved, 'attribute:health')).toHaveLength(1);
        });

        it('heals a well-fed player and pays for it in exhaustion, saturation first', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            player.instance.attributes.set('health', 15);

            const healed = logged(fixture.runtime, () => fixture.runtime.tick(80));

            expect(healthOf(player)).toBe(16);
            // Six points of exhaustion are one point of saturation and two left over.
            expect(components.get('vitals.saturation')).toBe(19);
            expect(components.get('vitals.exhaustion')).toBe(2);
            expect(fieldsOf(healed, 'vitals.saturation')).toHaveLength(1);
            expect(fieldsOf(healed, 'vitals.exhaustion')).toHaveLength(1);
        });

        it('does not heal with natural regeneration turned off', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ gameRules: { naturalRegeneration: false } }));
            const { player } = standingPlayer(fixture);
            player.instance.attributes.set('health', 15);

            fixture.runtime.tick(80);
            expect(healthOf(player)).toBe(15);
        });

        it('undoes a hunger write with the unit that made it', () => {
            const fixture = storePlayerFixture();
            const { components } = standingPlayer(fixture);

            const entries = logged(fixture.runtime, () => {
                const outcome = fixture.runtime.store.unit(() => {
                    components.set('vitals.food', 7);
                    throw new Error('planned');
                });
                expect(outcome.failed).toBe(true);
            });

            expect(components.get('vitals.food')).toBe(20);
            expect(fieldsOf(entries, 'vitals.food')).toHaveLength(0);
        });
    });

    describe('breath', () => {
        it('empties with the head underwater, one logged entry a tick', () => {
            const fixture = storePlayerFixture();
            fixture.world.setBlock(HEAD, 'minecraft:water');
            const { components } = standingPlayer(fixture);

            const entries = ticks(fixture, 3);

            expect(components.get('vitals.air')).toBe(components.maxAir() - 3);
            expect(components.get('vitals.breathing')).toBe(false);
            expect(fieldsOf(entries, 'vitals.air')).toHaveLength(3);
            expect(fieldsOf(entries, 'vitals.breathing')).toHaveLength(1);
        });

        it('drowns an empty player two half-hearts a second, and once only', () => {
            const fixture = storePlayerFixture();
            fixture.world.setBlock(HEAD, 'minecraft:water');
            const { player, components } = standingPlayer(fixture);
            components.set('vitals.air', 0);

            ticks(fixture, 19);
            expect(healthOf(player)).toBe(20);
            ticks(fixture, 1, 20);
            expect(healthOf(player)).toBe(18);
            // The shipped `minecraft:breathable` keeps no air for a player, so it drowns nobody.
            expect(player.instance.componentState.get(AIR_STATE)).toBeUndefined();
        });

        it('empties without drowning when the drowning game rule is off', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ gameRules: { drowningDamage: false } }));
            fixture.world.setBlock(HEAD, 'minecraft:water');
            const { player, components } = standingPlayer(fixture);
            components.set('vitals.air', 0);

            ticks(fixture, 40);
            expect(healthOf(player)).toBe(20);
        });

        it('refills five ticks a tick out of the water', () => {
            const fixture = storePlayerFixture();
            const { components } = standingPlayer(fixture);
            components.set('vitals.air', 100);
            components.set('vitals.breathing', false);

            ticks(fixture, 2);
            expect(components.get('vitals.air')).toBe(110);
            expect(components.get('vitals.breathing')).toBe(true);
        });

        it('waits over a chunk that is not loaded, and loads nothing', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ unloadedFromX: 0 }));
            const { components } = standingPlayer(fixture);
            components.set('vitals.air', 100);

            const entries = ticks(fixture, 5);
            expect(components.get('vitals.air')).toBe(100);
            expect(fieldsOf(entries, 'vitals.air')).toHaveLength(0);
        });
    });
});
