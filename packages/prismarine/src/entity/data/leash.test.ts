import { describe, expect, it } from 'vitest';

import { LEASH_SNAP_DISTANCE, leashSnapDistance } from './leash';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const Y = FLOOR_Y + 1;

const LEASHED = {
    components: {
        'minecraft:health': { value: 10, max: 10 },
        'minecraft:leashable': {},
        'minecraft:leashable_to': {}
    }
};

const POST = { components: { 'minecraft:health': { value: 10, max: 10 } } };

const fixture = () =>
    entityFixture(new TestEntityWorld(), {}, { 'jsprismarine:leashed': LEASHED, 'jsprismarine:post': POST });

describe('leashSnapDistance', () => {
    it("is Java's 12 blocks, and 16 for the ghasts", () => {
        expect(leashSnapDistance('minecraft:cow')).toBe(LEASH_SNAP_DISTANCE);
        expect(LEASH_SNAP_DISTANCE).toBe(12);
        expect(leashSnapDistance('minecraft:happy_ghast')).toBe(16);
        expect(leashSnapDistance('minecraft:ghast')).toBe(16);
    });
});

describe('a lead past its snap distance', () => {
    it('holds while the holder is within the snap distance', () => {
        const { runtime } = fixture();
        const leashed = runtime.spawn('jsprismarine:leashed', { x: 0.5, y: Y, z: 0.5 });
        const holder = runtime.spawn('jsprismarine:post', { x: 0.5 + LEASH_SNAP_DISTANCE - 1, y: Y, z: 0.5 });
        expect(runtime.attachLead(holder!.id, leashed!.id)).toBe(true);

        runtime.tick(1);

        expect(runtime.leashHolderIdOf(leashed!.id)).toBe(holder!.id);
    });

    it('snaps and drops the lead once the holder is past it', () => {
        const { runtime, world } = fixture();
        const leashed = runtime.spawn('jsprismarine:leashed', { x: 0.5, y: Y, z: 0.5 });
        const holder = runtime.spawn('jsprismarine:post', { x: 0.5 + LEASH_SNAP_DISTANCE + 1, y: Y, z: 0.5 });
        runtime.attachLead(holder!.id, leashed!.id);

        runtime.tick(1);

        expect(runtime.leashHolderIdOf(leashed!.id)).toBeUndefined();
        expect(world.drops.map((drop) => drop.item)).toEqual([{ identifier: 'minecraft:lead', count: 1 }]);
    });
});

describe('transferLeashes', () => {
    it("moves a player's leads onto an entity that declares minecraft:leashable_to", () => {
        const { runtime } = fixture();
        const led = runtime.spawn('jsprismarine:leashed', { x: 0.5, y: Y, z: 0.5 });
        const holder = runtime.spawn('jsprismarine:leashed', { x: 2.5, y: Y, z: 0.5 });
        runtime.attachLead(42, led!.id);

        expect(runtime.transferLeashes(42, holder!.id)).toBe(true);
        expect(runtime.leashHolderIdOf(led!.id)).toBe(holder!.id);
    });

    it('leaves the leads with the player when the entity cannot hold one', () => {
        const { runtime } = fixture();
        const led = runtime.spawn('jsprismarine:leashed', { x: 0.5, y: Y, z: 0.5 });
        const post = runtime.spawn('jsprismarine:post', { x: 2.5, y: Y, z: 0.5 });
        runtime.attachLead(42, led!.id);

        expect(runtime.transferLeashes(42, post!.id)).toBe(false);
        expect(runtime.leashHolderIdentityOf(led!.id)).toBe('player:player-42');
    });

    it('leaves a lead whose entity is past its snap distance from the new holder', () => {
        const { runtime } = fixture();
        const led = runtime.spawn('jsprismarine:leashed', { x: 0.5, y: Y, z: 0.5 });
        const holder = runtime.spawn('jsprismarine:leashed', { x: 0.5 + LEASH_SNAP_DISTANCE + 1, y: Y, z: 0.5 });
        runtime.attachLead(42, led!.id);

        expect(runtime.transferLeashes(42, holder!.id)).toBe(false);
    });
});
