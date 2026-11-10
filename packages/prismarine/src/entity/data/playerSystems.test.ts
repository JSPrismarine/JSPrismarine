/**
 * The player systems over a store player: the same survival rules a legacy player runs, written
 * through logged component fields and run from the entity pass, reading loaded chunks only.
 * Asserted as health, component values and change log entries.
 */
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
});
