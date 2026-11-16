import type { FilterEntityView } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import type { DataEntity } from './DataEntity';
import type { EntityFixture } from './testing';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';
import { VEHICLE_BREAK_DAMAGE, VEHICLE_DAMAGE_PER_POINT, boatItemOf } from './vehicleDamage';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };
const PLAYER = 9001;

/** A store with a boat, a chest boat and a few mounts, and one player beside them. */
const fixtureOf = (creative = false): { readonly fixture: EntityFixture; readonly world: TestEntityWorld } => {
    const world = new TestEntityWorld({
        players: [
            {
                id: PLAYER,
                identifier: 'minecraft:player',
                position: { ...GROUND, x: GROUND.x + 1 },
                ...(creative ? { creative: true } : {})
            }
        ]
    });
    const fixture = entityFixture(
        world,
        {},
        {
            'minecraft:boat': { components: { 'minecraft:type_family': { family: ['boat'] } } },
            'minecraft:chest_boat': {
                components: {
                    'minecraft:type_family': { family: ['boat'] },
                    'minecraft:inventory': { container_type: 'chest_boat', inventory_size: 27 }
                }
            },
            'jsprismarine:camel_like': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:inventory': { container_type: 'horse' },
                    'minecraft:equippable': { slots: [{ slot: 0, item: 'minecraft:saddle' }] }
                }
            },
            'jsprismarine:no_container': {
                components: { 'minecraft:health': { value: 20, max: 20 }, 'minecraft:inventory': {} }
            },
            'jsprismarine:llama_like': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:strength': { value: 2, max: 5 },
                    'minecraft:inventory': {
                        container_type: 'horse',
                        inventory_size: 16,
                        additional_slots_per_strength: 3
                    },
                    'minecraft:equippable': { slots: [{ slot: 1, item: 'carpet', accepted_items: ['carpet'] }] }
                }
            }
        }
    );
    return { fixture, world };
};

const spawned = (fixture: EntityFixture, identifier: string, data?: Record<string, unknown>): DataEntity => {
    const entity = fixture.runtime.spawn(identifier, GROUND, data === undefined ? {} : { data });
    if (entity === undefined) throw new Error(`the fixture declares no ${identifier}`);
    return entity;
};

const punch = (fixture: EntityFixture, entity: DataEntity, amount = 1): void => {
    fixture.runtime.damage({
        target: entity.id,
        attacker: PLAYER,
        cause: 'entity_attack',
        amount,
        source: { route: 'melee', graced: false, mitigated: false, bypassesGrace: true }
    });
};

/** Punches Java's `VehicleEntity` takes before its damage passes the break line. */
const BLOWS_TO_BREAK = Math.floor(VEHICLE_BREAK_DAMAGE / VEHICLE_DAMAGE_PER_POINT) + 1;

describe('a boat under blows', () => {
    it('holds until its damage passes 40, then breaks and drops the boat of its own wood', () => {
        const { fixture, world } = fixtureOf();
        const boat = spawned(fixture, 'minecraft:boat', { variant: 'acacia' });

        for (let blow = 1; blow < BLOWS_TO_BREAK; blow += 1) punch(fixture, boat);
        expect(boat.removed).toBeUndefined();

        punch(fixture, boat);
        expect(boat.removed).toBeDefined();
        expect(world.drops.map((drop) => drop.item)).toEqual([{ identifier: 'minecraft:acacia_boat', count: 1 }]);
    });

    it('takes a point of damage off every tick, so slow punches never break it', () => {
        const { fixture } = fixtureOf();
        const boat = spawned(fixture, 'minecraft:boat');

        for (let blow = 0; blow < BLOWS_TO_BREAK * 3; blow += 1) {
            punch(fixture, boat);
            for (let tick = 0; tick < VEHICLE_DAMAGE_PER_POINT; tick += 1) fixture.runtime.tick(tick);
        }
        expect(boat.removed).toBeUndefined();
    });

    it('drops a chest boat and what its chest held', () => {
        const { fixture, world } = fixtureOf();
        const boat = spawned(fixture, 'minecraft:chest_boat', { variant: 'bamboo' });
        boat.body.setContainerSlot(3, { identifier: 'minecraft:diamond', count: 2 });

        punch(fixture, boat, 10);
        expect(world.drops.map((drop) => drop.item)).toEqual([
            { identifier: 'minecraft:bamboo_chest_raft', count: 1 },
            { identifier: 'minecraft:diamond', count: 2 }
        ]);
    });

    it('is removed without its item by a creative player', () => {
        const { fixture, world } = fixtureOf(true);
        const boat = spawned(fixture, 'minecraft:boat');

        punch(fixture, boat);
        expect(boat.removed).toBeDefined();
        expect(world.drops).toEqual([]);
    });

    it('names the item after the wood, a raft for bamboo and oak by default', () => {
        expect(boatItemOf('minecraft:boat', undefined)).toBe('minecraft:oak_boat');
        expect(boatItemOf('minecraft:boat', 'bamboo')).toBe('minecraft:bamboo_raft');
        expect(boatItemOf('minecraft:chest_boat', 'cherry')).toBe('minecraft:cherry_chest_boat');
        expect(boatItemOf('minecraft:zombie', 'oak')).toBeUndefined();
    });
});

describe('a mount container', () => {
    it('holds only the equipment slots when its definition states no size', () => {
        const { fixture } = fixtureOf();
        expect(spawned(fixture, 'jsprismarine:camel_like').body.containerCapacity).toBe(1);
        expect(spawned(fixture, 'jsprismarine:no_container').body.containerCapacity).toBe(0);
    });

    it('gives a strength-scaled chest three slots a point, inventory_size being the size at the most strength', () => {
        const { fixture } = fixtureOf();
        // The carpet slot and three slots for each of two points of strength.
        expect(spawned(fixture, 'jsprismarine:llama_like').body.containerCapacity).toBe(1 + 2 * 3);
    });
});

describe('an equippable slot no interaction fills', () => {
    const standing: FilterEntityView = { flag: (name) => (name === 'is_sneaking' ? false : undefined) };
    const sneaking: FilterEntityView = { flag: (name) => name === 'is_sneaking' };

    it('takes a carpet on a tamed adult, as Java Equippable.equipOnInteract does', () => {
        const { fixture } = fixtureOf();
        const mount = spawned(fixture, 'jsprismarine:llama_like');
        mount.body.conditions.add('is_tamed');

        const result = fixture.runtime.interactWithItem(mount.id, PLAYER, 'minecraft:red_carpet', standing);
        expect(result.accepted).toBe(true);
        expect(mount.body.containerSlots[0]).toEqual({ identifier: 'minecraft:red_carpet', count: 1 });

        // The slot is full now, so a second carpet stays in the hand.
        expect(fixture.runtime.interactWithItem(mount.id, PLAYER, 'minecraft:blue_carpet', standing).accepted).toBe(
            false
        );
    });

    it('refuses an untamed mount, a sneaking player and an item the slot does not take', () => {
        const { fixture } = fixtureOf();
        const wild = spawned(fixture, 'jsprismarine:llama_like');
        expect(fixture.runtime.interactWithItem(wild.id, PLAYER, 'minecraft:red_carpet', standing).accepted).toBe(
            false
        );

        const tamed = spawned(fixture, 'jsprismarine:llama_like');
        tamed.body.conditions.add('is_tamed');
        expect(fixture.runtime.interactWithItem(tamed.id, PLAYER, 'minecraft:red_carpet', sneaking).accepted).toBe(
            false
        );
        expect(fixture.runtime.interactWithItem(tamed.id, PLAYER, 'minecraft:saddle', standing).accepted).toBe(false);
        expect(tamed.body.containerSlots).toEqual([]);
    });
});
