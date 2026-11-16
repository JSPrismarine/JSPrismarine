import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import type { GoalMob, GoalWorld } from '../world';

/** The social family: breeding, tempting, following an owner, mounting and trading. */

const flatWorld = (size = 32): GoalWorld => {
    const floor = Array.from({ length: size }, () => '#'.repeat(size));
    const air = Array.from({ length: size }, () => '.'.repeat(size));
    const view = voxelGrid([floor, air, air, air]);
    return { navigation: () => view };
};

const walker = { 'minecraft:collision_box': { width: 0.6, height: 1.8 }, 'minecraft:navigation.walk': {} };

describe('breeding goals', () => {
    it('courts a partner the world accepts and breeds once the courtship is over', () => {
        const mate = testMob('mate', { x: 9.5, y: 1, z: 8.5 });
        const bred: (string | number)[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.breed': { priority: 3, speed_multiplier: 1 } },
            components: walker,
            world: {
                ...flatWorld(),
                mobs: () => [mate],
                canBreedWith: (mob) => mob.id === 'mate',
                breedWith: (mob) => bred.push(mob.id)
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick(5);
        expect(bred).toEqual([]);
        expect(harness.holderOf('move')).toBe('minecraft:behavior.breed');

        harness.tick(60);
        expect(bred).toEqual(['mate']);
    });

    it('does not start when the world rejects every partner', () => {
        const other = testMob('other', { x: 9.5, y: 1, z: 8.5 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.breed': { priority: 3 } },
            components: walker,
            world: { ...flatWorld(), mobs: () => [other], canBreedWith: () => false },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });

    it.each(['minecraft:behavior.breed', 'minecraft:behavior.make_love', 'minecraft:behavior.receive_love'])(
        '%s skips the partner search when the entity is not ready',
        (name) => {
            const other = testMob('other', { x: 9.5, y: 1, z: 8.5 });
            let searches = 0;
            const harness = new GoalHarness({
                goals: { [name]: { priority: 3 } },
                components: walker,
                world: {
                    ...flatWorld(),
                    isReadyToBreed: () => false,
                    mobs: () => {
                        searches += 1;
                        return [other];
                    },
                    canBreedWith: () => true
                },
                at: { x: 8.5, y: 1, z: 8.5 }
            });

            harness.tick(3);

            expect(searches).toBe(0);
            expect(harness.running()).toEqual([]);
        }
    );
});

describe('minecraft:behavior.tempt', () => {
    const body = {
        priority: 4,
        speed_multiplier: 1.25,
        within_radius: 16,
        items: ['minecraft:wheat']
    };

    it('follows a player holding one of its items and stops 2.5 blocks short', () => {
        const player = testMob('player', { x: 14.5, y: 1, z: 8.5 }, { heldItem: 'minecraft:wheat' });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.tempt': body },
            components: walker,
            world: { ...flatWorld(), players: () => [player] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.tempt');
        expect(harness.actuator.log).toContain('lookAt 14.5,1,8.5');
    });

    it('reads an item the file writes without a namespace, as the vanilla cow writes wheat', () => {
        const player = testMob('player', { x: 14.5, y: 1, z: 8.5 }, { heldItem: 'minecraft:wheat' });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.tempt': { ...body, items: ['wheat'] } },
            components: walker,
            world: { ...flatWorld(), players: () => [player] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.tempt');
    });

    it('ignores a player holding something else', () => {
        const player = testMob('player', { x: 10.5, y: 1, z: 8.5 }, { heldItem: 'minecraft:stone' });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.tempt': body },
            components: walker,
            world: { ...flatWorld(), players: () => [player] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });

    it('fires on_tempt_end when the player puts the item away', () => {
        let held: string | undefined = 'minecraft:wheat';
        const player: GoalMob = {
            id: 'player',
            position: () => ({ x: 12.5, y: 1, z: 8.5 }),
            view: () => ({}),
            heldItem: () => held
        };
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.tempt': { ...body, on_tempt_end: { event: 'minecraft:stop_tempting' } }
            },
            components: walker,
            world: { ...flatWorld(), players: () => [player] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();
        expect(harness.isRunning('minecraft:behavior.tempt')).toBe(true);

        held = undefined;
        harness.tick();
        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.follow_parent', () => {
    it('only runs on a baby, and only when a parent is further than 3 blocks', () => {
        const parent = testMob('parent', { x: 14.5, y: 1, z: 8.5 }, { identifier: 'test:entity' });
        const world = { ...flatWorld(), mobs: () => [parent] };

        const adult = new GoalHarness({
            goals: { 'minecraft:behavior.follow_parent': { priority: 5 } },
            components: walker,
            world,
            at: { x: 8.5, y: 1, z: 8.5 }
        });
        adult.tick();
        expect(adult.running()).toEqual([]);

        const baby = new GoalHarness({
            goals: { 'minecraft:behavior.follow_parent': { priority: 5, speed_multiplier: 1.1 } },
            // `is_baby` is a fact the entity answers from its own components,
            // not one a caller's filter context can set.
            components: { ...walker, 'minecraft:is_baby': {} },
            world,
            at: { x: 8.5, y: 1, z: 8.5 }
        });
        baby.tick();
        expect(baby.holderOf('move')).toBe('minecraft:behavior.follow_parent');
    });
});

describe('minecraft:behavior.follow_owner', () => {
    it('teleports when no path reaches the owner and can_teleport is set', () => {
        const owner = testMob('owner', { x: 40, y: 1, z: 40 });
        const teleports: number[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.follow_owner': {
                    priority: 6,
                    start_distance: 5,
                    stop_distance: 2,
                    can_teleport: true
                }
            },
            components: walker,
            world: {
                ...flatWorld(16),
                owner: () => owner,
                teleportTo: (position) => teleports.push(position.x)
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(teleports).toEqual([40]);
    });
});

describe('minecraft:behavior.stay_while_sitting', () => {
    it('holds the move flag for as long as the entity is sitting', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.stay_while_sitting': { priority: 3 } },
            flags: { is_sitting: true }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.stay_while_sitting');
        // Java's SitWhenOrderedToGoal holds JUMP too, so nothing jumps a sitting pet.
        expect(harness.holderOf('jump')).toBe('minecraft:behavior.stay_while_sitting');
        expect(harness.actuator.log).toContain('stopMoving');
    });

    it('stays off while the entity stands', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.stay_while_sitting': { priority: 3 } },
            flags: { is_sitting: false }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.find_mount', () => {
    it('walks to a mount and climbs on once it arrives', () => {
        const chicken = testMob('chicken', { x: 9.5, y: 1, z: 8.5 });
        const mounted: (string | number)[] = [];
        let vehicle: GoalMob | undefined;
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.find_mount': { priority: 1, within_radius: 16, mount_distance: 2 } },
            components: walker,
            world: {
                ...flatWorld(),
                mobs: () => [chicken],
                vehicle: () => vehicle,
                mount: (mob) => {
                    mounted.push(mob.id);
                    vehicle = mob;
                }
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick(2);

        expect(mounted).toEqual(['chicken']);
    });
});

describe('minecraft:behavior.trade_with_player', () => {
    it('holds the entity still while the trade screen is open', () => {
        const player = testMob('player', { x: 9.5, y: 1, z: 8.5 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.trade_with_player': { priority: 2 } },
            world: { tradingPlayer: () => player }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.trade_with_player');
        expect(harness.holderOf('jump')).toBe('minecraft:behavior.trade_with_player');
    });

    it('does not run when nobody is trading', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.trade_with_player': { priority: 2 } },
            world: {}
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.offer_flower', () => {
    it("holds the flower out for Java's adjustedTickDelay(400): 200 selector passes, 400 game ticks", () => {
        let draws = 0;
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.offer_flower': { priority: 1 } },
            world: { mobs: () => [testMob('villager', { x: 2, y: 0, z: 0 })] },
            random: () => (draws++ === 0 ? 0 : 0.99)
        });

        let held = 0;
        harness.tick();
        while (harness.isRunning('minecraft:behavior.offer_flower') && held < 1000) {
            held += 1;
            harness.tick();
        }

        expect(held).toBe(200);
    });
});

describe('minecraft:behavior.controlled_by_player', () => {
    /** A saddled pig with one rider holding `held`. */
    const ridden = (held: string | undefined) => {
        const rider = testMob(
            'player',
            { x: 0, y: 64, z: 0 },
            { identifier: 'minecraft:player', ...(held === undefined ? {} : { heldItem: held }) }
        );
        return new GoalHarness({
            goals: { 'minecraft:behavior.controlled_by_player': { priority: 0 } },
            components: { 'minecraft:item_controllable': { control_items: 'carrotOnAStick' } },
            world: { riders: () => [rider] }
        });
    };

    it('takes the walk only while its rider holds the item it steers with, as Java hands the pig over', () => {
        const steered = ridden('minecraft:carrot_on_a_stick');
        steered.tick();
        expect(steered.holderOf('move')).toBe('minecraft:behavior.controlled_by_player');

        const carried = ridden('minecraft:stick');
        carried.tick();
        expect(carried.isRunning('minecraft:behavior.controlled_by_player')).toBe(false);

        const emptyHanded = ridden(undefined);
        emptyHanded.tick();
        expect(emptyHanded.isRunning('minecraft:behavior.controlled_by_player')).toBe(false);
    });

    it('is steered by a mob riding it whatever the mob holds, as Mob.getControllingPassenger hands it over', () => {
        const jockey = testMob('jockey', { x: 0, y: 64, z: 0 }, { identifier: 'minecraft:zombie' });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.controlled_by_player': { priority: 0 } },
            components: { 'minecraft:item_controllable': { control_items: 'carrotOnAStick' } },
            world: { riders: () => [jockey] }
        });
        harness.tick();
        expect(harness.isRunning('minecraft:behavior.controlled_by_player')).toBe(true);
    });
});
