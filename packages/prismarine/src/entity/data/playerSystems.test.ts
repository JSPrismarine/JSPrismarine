/**
 * The player systems over a store player: the same survival rules a legacy player runs, written
 * through logged component fields and run from the entity pass, reading loaded chunks only.
 * Asserted as health, component values and change log entries.
 */
import { AIR_STATE } from '@jsprismarine/entities';
import { Gametype, LevelEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { enteredStorePlayer, fieldsOf, logged, storePlayerFixture } from '../../testing/storePlayer.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';

import { moveStorePlayer, spawnStorePlayer, StorePlayers } from './storePlayers';
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

/** Reports one client move of a store player, as the input step would. */
const report = (fixture: EntityFixture, player: DataEntity, at: { x?: number; y: number }, onGround: boolean) =>
    fixture.runtime.applyClientMovement(player.id, {
        position: { x: at.x ?? 0.5, y: at.y, z: 0.5 },
        yaw: 0,
        pitch: 0,
        onGround
    });

/** Drops a store player from `height` blocks above the floor to it, a block a report, and lands it. */
const dropFrom = (fixture: EntityFixture, player: DataEntity, height: number) =>
    logged(fixture.runtime, () => {
        report(fixture, player, { y: FLOOR_Y + 1 + height }, false);
        for (let fallen = 1; fallen <= height; fallen += 1)
            report(fixture, player, { y: FLOOR_Y + 1 + height - fallen }, fallen === height);
    });

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

    describe('falls', () => {
        it('takes a half-heart for every block past the third, through the damage pipeline', () => {
            const fixture = storePlayerFixture();
            const { player } = standingPlayer(fixture);

            const entries = dropFrom(fixture, player, 10);

            expect(healthOf(player)).toBe(13);
            expect(fieldsOf(entries, 'attribute:health')).toHaveLength(1);
            expect(fieldsOf(entries, 'vitals.fallDistance').length).toBeGreaterThan(0);
        });

        it('starts the fall at the top of a jump', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);

            report(fixture, player, { y: FLOOR_Y + 2 }, false);
            expect(components.get('vitals.fallDistance')).toBe(0);
            report(fixture, player, { y: FLOOR_Y + 1 }, true);
            expect(healthOf(player)).toBe(20);
            expect(components.get('vitals.fallDistance')).toBe(0);
        });

        it('lands softly on a block under the feet that breaks a fall', () => {
            const fixture = storePlayerFixture();
            fixture.world.setBlock({ x: 0, y: FLOOR_Y, z: 0 }, 'minecraft:hay_block');
            const { player } = standingPlayer(fixture);

            dropFrom(fixture, player, 10);
            expect(healthOf(player)).toBe(20);
        });

        it('is not hurt with the fall damage game rule off', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ gameRules: { fallDamage: false } }));
            const { player } = standingPlayer(fixture);

            dropFrom(fixture, player, 10);
            expect(healthOf(player)).toBe(20);
        });

        it('is not hurt landing where no chunk is loaded, and loads none', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ unloadedFromX: 0 }));
            const { player } = standingPlayer(fixture);

            dropFrom(fixture, player, 10);
            expect(healthOf(player)).toBe(20);
        });

        it("reads the ground from the body's on_ground condition, and leaves the legacy field alone", () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);

            const entries = logged(fixture.runtime, () => report(fixture, player, { y: FLOOR_Y + 1 }, true));

            expect(player.body.conditions.has('on_ground')).toBe(true);
            expect(components.get('movement.onGround')).toBe(false);
            expect(fieldsOf(entries, 'movement.onGround')).toHaveLength(0);
        });

        it('charges a walk on the ground in exhaustion, and a long jump as a teleport not at all', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);

            report(fixture, player, { x: 2.5, y: FLOOR_Y + 1 }, true);
            expect(components.get('vitals.exhaustion')).toBeCloseTo(0.02);

            report(fixture, player, { x: 40.5, y: FLOOR_Y + 1 }, true);
            expect(components.get('vitals.exhaustion')).toBeCloseTo(0.02);
        });
    });

    describe('meals', () => {
        it('finishes a meal on the store tick its time is up with the same item in hand, as plain logged data', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            fixture.world.held.set(player.id, 'minecraft:bread');

            const begun = logged(fixture.runtime, () => {
                expect(fixture.runtime.playerSystems.beginMeal(player, 32)).toBe(true);
            });
            // The meal began in the store's first tick. The level clock never moves here.
            expect(components.get('consumption.meal')).toEqual({ startedAt: 1, ticks: 32, item: 'minecraft:bread' });
            expect(fieldsOf(begun, 'consumption.meal')).toHaveLength(1);

            ticks(fixture, 31, 2);
            expect(fixture.world.meals).toEqual([]);

            const finished = ticks(fixture, 1, 33);
            expect(fixture.world.meals).toEqual([{ playerId: player.id, item: 'minecraft:bread' }]);
            expect(components.get('consumption.meal')).toBeNull();
            expect(fieldsOf(finished, 'consumption.meal')).toHaveLength(1);
        });

        it('keeps the clock of a meal reported again part way through', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            fixture.world.held.set(player.id, 'minecraft:bread');

            fixture.runtime.playerSystems.beginMeal(player, 32);
            ticks(fixture, 10);
            fixture.runtime.playerSystems.beginMeal(player, 32);
            expect(components.get('consumption.meal')?.startedAt).toBe(0);
        });

        it('ends a meal without finishing it when another item is in hand by then', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            fixture.world.held.set(player.id, 'minecraft:bread');
            fixture.runtime.playerSystems.beginMeal(player, 32);

            fixture.world.held.set(player.id, 'minecraft:stone');
            ticks(fixture, 32);
            expect(fixture.world.meals).toEqual([]);
            expect(components.get('consumption.meal')).toBeNull();
        });

        it('forgets a meal that is let go of, and undoes one that began in a unit that threw', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            fixture.world.held.set(player.id, 'minecraft:bread');

            fixture.runtime.playerSystems.beginMeal(player, 32);
            fixture.runtime.playerSystems.cancelMeal(player);
            expect(components.get('consumption.meal')).toBeNull();

            logged(fixture.runtime, () => {
                fixture.runtime.store.unit(() => {
                    fixture.runtime.playerSystems.beginMeal(player, 32);
                    throw new Error('planned');
                });
            });
            expect(components.get('consumption.meal')).toBeNull();
        });

        it('begins no meal with an empty hand', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            expect(fixture.runtime.playerSystems.beginMeal(player, 32)).toBe(false);
            expect(components.get('consumption.meal')).toBeNull();
        });
    });

    describe('as a StorePlayer', () => {
        it('shares one set of components with the systems, logged and run by them', () => {
            const fixture = storePlayerFixture();
            const { player, entity } = enteredStorePlayer(fixture);

            const entries = logged(fixture.runtime, () => {
                player.setFood(0);
                fixture.runtime.tick(80);
            });

            expect(fixture.runtime.playerSystems.componentsOf(entity).get('vitals.food')).toBe(0);
            expect(fieldsOf(entries, 'vitals.food')).toHaveLength(1);
            expect(player.getHealth()).toBe(19);
        });
    });

    describe('mining', () => {
        /** The floor block under a standing player, mined from above. */
        const mined = (fixture: EntityFixture) => ({
            x: 0,
            y: FLOOR_Y,
            z: 0,
            face: 1,
            runtimeId: fixture.world.runtimeIdOf('minecraft:stone'),
            progressPerTick: 900
        });

        it('animates the cracks every tick: the particles off the face, then the progress', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ runtimeIds: true }));
            const { player } = standingPlayer(fixture);
            const mining = mined(fixture);
            fixture.runtime.playerSystems.setMining(player, mining);

            ticks(fixture, 2);

            const crack = [
                {
                    at: { x: 0.5, y: FLOOR_Y + 0.5, z: 0.5 },
                    event: LevelEvent.PARTICLES_CRACK_BLOCK_UP,
                    data: mining.runtimeId
                },
                { at: { x: 0, y: FLOOR_Y, z: 0 }, event: LevelEvent.UPDATE_BLOCK_CRACKING, data: 900 }
            ];
            expect(fixture.world.levelEvents).toEqual([...crack, ...crack]);
        });

        it('stops the cracks once the block is no longer the one being mined, and forgets it', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ runtimeIds: true }));
            const { player, components } = standingPlayer(fixture);
            fixture.runtime.playerSystems.setMining(player, mined(fixture));
            fixture.world.setBlock({ x: 0, y: FLOOR_Y, z: 0 }, 'minecraft:dirt');

            const entries = ticks(fixture, 2);

            expect(fixture.world.levelEvents).toEqual([
                { at: { x: 0, y: FLOOR_Y, z: 0 }, event: LevelEvent.STOP_BLOCK_CRACKING, data: 0 }
            ]);
            expect(components.get('mining.block')).toBeNull();
            expect(fieldsOf(entries, 'mining.block')).toHaveLength(1);
        });

        it('waits over a chunk that is not loaded, and sends nothing', () => {
            const fixture = storePlayerFixture(new TestEntityWorld({ unloadedFromX: 0, runtimeIds: true }));
            const { player, components } = standingPlayer(fixture);
            const mining = mined(fixture);
            fixture.runtime.playerSystems.setMining(player, mining);

            ticks(fixture, 3);
            expect(fixture.world.levelEvents).toEqual([]);
            expect(components.get('mining.block')).toEqual(mining);
        });

        it('stops the cracks when the mining ends without the client saying so', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            fixture.runtime.playerSystems.setMining(player, mined(fixture));

            fixture.runtime.playerSystems.stopMining(player);
            fixture.runtime.playerSystems.stopMining(player);

            expect(fixture.world.levelEvents).toEqual([
                { at: { x: 0, y: FLOOR_Y, z: 0 }, event: LevelEvent.STOP_BLOCK_CRACKING, data: 0 }
            ]);
            expect(components.get('mining.block')).toBeNull();
        });
    });

    describe('death and revival', () => {
        it('ends the drowning and the mining in the blow that kills it', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            components.set('vitals.drowningTicks', 7);
            fixture.runtime.playerSystems.setMining(player, {
                x: 0,
                y: FLOOR_Y,
                z: 0,
                face: 1,
                runtimeId: 1,
                progressPerTick: 9
            });

            fixture.runtime.hurt(player, undefined, 'entity_attack', 50);

            expect(components.get('vitals.drowningTicks')).toBe(0);
            expect(components.get('mining.block')).toBeNull();
            expect(fixture.world.levelEvents.map(({ event }) => event)).toEqual([LevelEvent.STOP_BLOCK_CRACKING]);
        });

        it('comes back fed, with full lungs and a body at rest, and the log says so', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            components.set('vitals.food', 3);
            components.set('vitals.air', 40);
            components.set('movement.sprinting', true);
            fixture.runtime.hurt(player, undefined, 'entity_attack', 50);

            const revival = logged(fixture.runtime, () => {
                expect(fixture.runtime.revive(player.id)).toBe(true);
            });

            expect(components.get('vitals.food')).toBe(20);
            expect(components.get('vitals.air')).toBe(components.maxAir());
            expect(components.get('movement.sprinting')).toBe(false);
            expect(fieldsOf(revival, 'vitals.food')).toHaveLength(1);
            expect(revival.filter((entry) => entry.kind === 'membership')).toHaveLength(0);
        });
    });

    describe('game mode', () => {
        it('spares a creative player hunger, breath and falls, and logs and undoes the change', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            components.set('vitals.food', 0);

            const change = logged(fixture.runtime, () => components.set('abilities.gamemode', Gametype.CREATIVE));
            expect(fieldsOf(change, 'abilities.gamemode')).toHaveLength(1);
            ticks(fixture, 80);
            expect(dropFrom(fixture, player, 10)).toBeDefined();
            expect(healthOf(player)).toBe(20);

            fixture.runtime.store.beginTick();
            fixture.runtime.store.unit(() => {
                components.set('abilities.gamemode', Gametype.SURVIVAL);
                throw new Error('undo it');
            });
            fixture.runtime.store.sealTick();
            expect(components.get('abilities.gamemode')).toBe(Gametype.CREATIVE);
        });

        it('reaches a player in adventure as in survival', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            components.set('abilities.gamemode', Gametype.ADVENTURE);
            components.set('vitals.food', 0);

            ticks(fixture, 1, 80);

            expect(healthOf(player)).toBe(19);
        });
    });

    describe('inputs', () => {
        it('writes sprinting and sneaking as logged component fields', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);

            const entries = logged(fixture.runtime, () => {
                fixture.runtime.playerSystems.setSprinting(player, true);
                fixture.runtime.playerSystems.setSneaking(player, true);
            });

            expect(components.get('movement.sprinting')).toBe(true);
            expect(components.get('movement.sneaking')).toBe(true);
            expect(fieldsOf(entries, 'movement.sprinting')).toHaveLength(1);
            expect(fieldsOf(entries, 'movement.sneaking')).toHaveLength(1);
        });

        it('charges a sprint jump four times what a standing jump costs', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);

            fixture.runtime.playerSystems.jumped(player);
            const standing = components.get('vitals.exhaustion');
            fixture.runtime.playerSystems.setSprinting(player, true);
            fixture.runtime.playerSystems.jumped(player);

            expect(standing).toBeGreaterThan(0);
            expect(components.get('vitals.exhaustion') - standing).toBeCloseTo(standing * 4);
        });

        it('ends the fall in progress when the server moves the player', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            report(fixture, player, { y: FLOOR_Y + 11 }, false);
            report(fixture, player, { y: FLOOR_Y + 5 }, false);
            expect(components.get('vitals.fallDistance')).toBe(6);

            expect(fixture.runtime.teleportPlayer(player.id, { x: 0.5, y: FLOOR_Y + 2, z: 0.5 })).toBe(true);
            expect(components.get('vitals.fallDistance')).toBe(0);
            expect(player.body.teleportPending).toBe(true);
            report(fixture, player, { y: FLOOR_Y + 1 }, true);

            expect(healthOf(player)).toBe(20);
        });

        it('keeps the head yaw a client reports beside its move', () => {
            const fixture = storePlayerFixture();
            const player = spawnStorePlayer(
                fixture.runtime,
                new StorePlayers(),
                { x: 0.5, y: FLOOR_Y + 1, z: 0.5 },
                {
                    uuid: UUID.fromRandom(),
                    name: 'Steve',
                    xuid: ''
                }
            )!;

            const moved = moveStorePlayer(fixture.runtime, player, {
                position: { x: 1.5, y: FLOOR_Y + 1, z: 0.5 },
                yaw: 30,
                pitch: 5,
                onGround: true,
                headYaw: 45
            });

            expect(moved).toBe(true);
            expect([player.yaw, player.pitch, player.headYaw]).toEqual([30, 5, 45]);
            expect(player.isOnGround()).toBe(true);
            expect(player.entity?.position.x).toBe(1.5);
        });
    });

    describe('the entity pass', () => {
        it('ticks a player outside the ticking chunks, where a mob waits', () => {
            const fixture = storePlayerFixture();
            const { player, components } = standingPlayer(fixture);
            const cow = fixture.runtime.spawn('minecraft:cow', { x: 4.5, y: FLOOR_Y + 1, z: 0.5 })!;
            components.set('vitals.food', 0);
            const ticked: number[] = [];

            logged(fixture.runtime, () =>
                fixture.runtime.tick(80, (position) => {
                    ticked.push(position.x);
                    return false;
                })
            );

            expect(healthOf(player)).toBe(19);
            expect(ticked).toContain(cow.position.x);
            expect(ticked).not.toContain(player.position.x);
        });
    });
});
