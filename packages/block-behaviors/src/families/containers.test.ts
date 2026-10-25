import { describe, expect, it } from 'vitest';

import { bindFamily, heldItem } from '../harness';
import {
    beaconLevels,
    CAULDRON_BOTTLE_LEVELS,
    CAULDRON_FULL,
    cauldronFamily,
    COMPOSTER_FULL,
    composterFamily,
    containerFamily,
    flowerPotFamily,
    furnaceFamily,
    pairedPosition,
    utilityFamily
} from './containers';

const origin = { x: 0, y: 0, z: 0 };

describe('containerFamily', () => {
    it('gives a chest its slots and faces it away from the placer', () => {
        const harness = bindFamily(containerFamily, 'minecraft:chest');
        harness.dimension.set(origin, 'minecraft:chest', { 'minecraft:cardinal_direction': 'south' });

        harness.place(origin, { placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 0, z: -4 } } });

        expect(harness.dimension.getBlockData(origin)?.capacity).toBe(27);
        expect(harness.dimension.stateAt(origin, 'minecraft:cardinal_direction')).toBe('south');
    });

    it('pairs with the chest beside it, both ways', () => {
        const harness = bindFamily(containerFamily, 'minecraft:chest');
        const partner = { x: 1, y: 0, z: 0 };
        harness.dimension.set(partner, 'minecraft:chest');
        harness.dimension.setBlockData(partner, { capacity: 27, items: [] });
        harness.dimension.set(origin, 'minecraft:chest');

        harness.place(origin);

        expect(pairedPosition(harness.dimension.getBlockData(origin))).toEqual(partner);
        expect(pairedPosition(harness.dimension.getBlockData(partner))).toEqual(origin);
    });

    it('spills a chest and keeps a shulker box packed', () => {
        const chest = bindFamily(containerFamily, 'minecraft:chest');
        chest.dimension.set(origin, 'minecraft:chest');
        chest.dimension.setBlockData(origin, { capacity: 27, items: [{ identifier: 'minecraft:stone', count: 4 }] });

        chest.breakBlock(origin);

        expect(chest.dimension.drops.map((entry) => entry.drop.identifier)).toEqual([
            'minecraft:stone',
            'minecraft:chest'
        ]);

        const box = bindFamily(containerFamily, 'minecraft:undyed_shulker_box');
        box.dimension.set(origin, 'minecraft:undyed_shulker_box');
        box.dimension.setBlockData(origin, { capacity: 27, items: [{ identifier: 'minecraft:stone', count: 4 }] });

        box.breakBlock(origin);

        expect(box.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:undyed_shulker_box']);
    });

    it('marks a barrel open while a player uses it', () => {
        const harness = bindFamily(containerFamily, 'minecraft:barrel');
        harness.dimension.set(origin, 'minecraft:barrel', { open_bit: false, facing_direction: 1 });

        expect(harness.interact(origin)).toBe(true);
        expect(harness.dimension.stateAt(origin, 'open_bit')).toBe(true);
    });
});

describe('furnaceFamily', () => {
    it('gives a furnace three slots and spills them on break', () => {
        const harness = bindFamily(furnaceFamily, 'minecraft:furnace');
        harness.dimension.set(origin, 'minecraft:furnace', { 'minecraft:cardinal_direction': 'south' });

        harness.place(origin);

        expect(harness.dimension.getBlockData(origin)?.capacity).toBe(3);

        harness.dimension.setBlockData(origin, { capacity: 3, items: [{ identifier: 'minecraft:coal', count: 1 }] });
        harness.breakBlock(origin);

        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual([
            'minecraft:coal',
            'minecraft:furnace'
        ]);
    });

    it('puts a campfire out when water sits on it', () => {
        const harness = bindFamily(furnaceFamily, 'minecraft:campfire');
        harness.dimension.set(origin, 'minecraft:campfire', {
            extinguished: false,
            'minecraft:cardinal_direction': 'south'
        });
        harness.dimension.set({ x: 0, y: 1, z: 0 }, 'minecraft:water');

        harness.neighborChanged(origin, 'up');

        expect(harness.dimension.stateAt(origin, 'extinguished')).toBe(true);
    });
});

describe('furnaceFamily relighting', () => {
    it('relights an extinguished campfire with flint and steel and leaves a lit one alone', () => {
        const harness = bindFamily(furnaceFamily, 'minecraft:campfire');
        harness.dimension.set(origin, 'minecraft:campfire', { extinguished: true });

        expect(harness.interact(origin)).toBeUndefined();
        expect(harness.dimension.stateAt(origin, 'extinguished')).toBe(true);

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:flint_and_steel') })).toBe(true);
        expect(harness.dimension.stateAt(origin, 'extinguished')).toBe(false);

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:flint_and_steel') })).toBeUndefined();
    });

    it('leaves a furnace, which has no flame state, to the next handler', () => {
        const harness = bindFamily(furnaceFamily, 'minecraft:furnace');
        harness.dimension.set(origin, 'minecraft:furnace');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:flint_and_steel') })).toBeUndefined();
    });
});

describe('cauldronFamily', () => {
    const emptyCauldron = (liquid = 'water') => {
        const harness = bindFamily(cauldronFamily, 'minecraft:cauldron');
        harness.dimension.set(origin, 'minecraft:cauldron', { fill_level: 0, cauldron_liquid: liquid });
        return harness;
    };

    it('takes a whole bucket and gives the empty one back', () => {
        const harness = emptyCauldron();

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:water_bucket') })).toBe(true);

        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(CAULDRON_FULL);
        expect(harness.dimension.stateAt(origin, 'cauldron_liquid')).toBe('water');
        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:bucket']);
    });

    it('fills a lava cauldron from a lava bucket and empties it back into one', () => {
        const harness = emptyCauldron();

        harness.interact(origin, { itemStack: heldItem('minecraft:lava_bucket') });

        expect(harness.dimension.stateAt(origin, 'cauldron_liquid')).toBe('lava');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:bucket') })).toBe(true);

        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(0);
        expect(harness.dimension.drops.at(-1)?.drop.identifier).toBe('minecraft:lava_bucket');
    });

    it('refuses an empty bucket against a cauldron that is not full', () => {
        const harness = emptyCauldron();
        harness.dimension.set(origin, 'minecraft:cauldron', { fill_level: 4, cauldron_liquid: 'water' });

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:bucket') })).toBeUndefined();
        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(4);
    });

    it('moves two levels per bottle in each direction', () => {
        const harness = emptyCauldron();

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:potion') })).toBe(true);

        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(CAULDRON_BOTTLE_LEVELS);
        expect(harness.dimension.drops.at(-1)?.drop.identifier).toBe('minecraft:glass_bottle');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:glass_bottle') })).toBe(true);

        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(0);
        expect(harness.dimension.drops.at(-1)?.drop.identifier).toBe('minecraft:potion');
    });

    it('refuses a brewed potion, which is not water', () => {
        const harness = emptyCauldron();
        const healing = heldItem('minecraft:potion', {
            'minecraft:potion_contents': { potion: 'minecraft:healing' }
        });

        expect(harness.interact(origin, { itemStack: healing })).toBeUndefined();
        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(0);
    });

    it('refuses a bottle against lava', () => {
        const harness = emptyCauldron('lava');
        harness.dimension.set(origin, 'minecraft:cauldron', { fill_level: CAULDRON_FULL, cauldron_liquid: 'lava' });

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:glass_bottle') })).toBeUndefined();
        expect(harness.dimension.stateAt(origin, 'fill_level')).toBe(CAULDRON_FULL);
    });

    it('leaves a bare hand to the next handler', () => {
        expect(emptyCauldron().interact(origin)).toBeUndefined();
    });
});

describe('composterFamily', () => {
    it('fills a layer per use and gives bone meal when it is full', () => {
        const harness = bindFamily(composterFamily, 'minecraft:composter');
        harness.dimension.set(origin, 'minecraft:composter', { composter_fill_level: 0 });

        for (let use = 0; use <= COMPOSTER_FULL; use += 1) harness.interact(origin);

        expect(harness.dimension.stateAt(origin, 'composter_fill_level')).toBe(COMPOSTER_FULL + 1);

        harness.interact(origin);

        expect(harness.dimension.stateAt(origin, 'composter_fill_level')).toBe(0);
        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:bone_meal']);
    });
});

describe('flowerPotFamily', () => {
    it('gives back the plant it holds', () => {
        const harness = bindFamily(flowerPotFamily, 'minecraft:flower_pot');
        harness.dimension.set(origin, 'minecraft:flower_pot', { update_bit: false });
        harness.dimension.setBlockData(origin, { capacity: 1, items: [{ identifier: 'minecraft:poppy', count: 1 }] });

        expect(harness.interact(origin)).toBe(true);
        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:poppy']);
        expect(harness.interact(origin)).toBeUndefined();
    });

    it('leaves the emptied pot reading as empty', () => {
        // `update_bit` is the pot's contents flag, and false is an empty pot. Setting it
        // here, which is what this used to do, put a flower_pot[update_bit=1] on the wire
        // claiming contents the player had just taken out.
        const harness = bindFamily(flowerPotFamily, 'minecraft:flower_pot');
        harness.dimension.set(origin, 'minecraft:flower_pot', { update_bit: false });
        harness.dimension.setBlockData(origin, { capacity: 1, items: [{ identifier: 'minecraft:poppy', count: 1 }] });

        harness.interact(origin);

        expect(harness.dimension.stateAt(origin, 'update_bit')).toBe(false);
        expect(harness.dimension.getBlockData(origin)?.items).toEqual([undefined]);
    });

    it('clears a pot that arrived with the contents flag already set', () => {
        const harness = bindFamily(flowerPotFamily, 'minecraft:flower_pot');
        harness.dimension.set(origin, 'minecraft:flower_pot', { update_bit: true });
        harness.dimension.setBlockData(origin, { capacity: 1, items: [{ identifier: 'minecraft:poppy', count: 1 }] });

        harness.interact(origin);

        expect(harness.dimension.stateAt(origin, 'update_bit')).toBe(false);
    });
});

describe('beaconLevels', () => {
    it('counts the complete pyramid layers under a beacon', () => {
        const harness = bindFamily(utilityFamily, 'minecraft:beacon');
        const beacon = { x: 0, y: 4, z: 0 };
        harness.dimension.fill({ x: -1, y: 3, z: -1 }, { x: 1, y: 3, z: 1 }, 'minecraft:iron_block');
        harness.dimension.set(beacon, 'minecraft:beacon');

        expect(beaconLevels(harness.dimension, beacon)).toBe(1);

        harness.dimension.fill({ x: -2, y: 2, z: -2 }, { x: 2, y: 2, z: 2 }, 'minecraft:diamond_block');

        expect(beaconLevels(harness.dimension, beacon)).toBe(2);

        harness.place(beacon);

        expect(harness.dimension.getBlockData(beacon)).toEqual({ levels: 2 });
    });
});

describe('utilityFamily', () => {
    it('falls when it is an anvil and makes its landing sound', () => {
        const harness = bindFamily(utilityFamily, 'minecraft:anvil');
        const anvil = { x: 0, y: 3, z: 0 };
        harness.dimension.set(origin, 'minecraft:stone');
        harness.dimension.set(anvil, 'minecraft:anvil', { 'minecraft:cardinal_direction': 'south' });

        harness.place(anvil);
        harness.tick(anvil);

        expect(harness.dimension.identifierAt({ x: 0, y: 2, z: 0 })).toBe('minecraft:anvil');

        harness.fallOn({ x: 0, y: 2, z: 0 }, 4);

        expect(harness.dimension.sounds.map((entry) => entry.name)).toEqual(['random.anvil_land']);
    });

    it('runs the spawner timer and spawns what its block entity names', () => {
        const harness = bindFamily(utilityFamily, 'minecraft:mob_spawner');
        harness.dimension.set(origin, 'minecraft:mob_spawner');
        harness.dimension.setBlockData(origin, { entity: 'minecraft:zombie' });

        harness.tick(origin);

        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:zombie']);
        expect(harness.dimension.scheduled).toHaveLength(1);
    });
});
