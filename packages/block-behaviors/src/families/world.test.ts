import { describe, expect, it } from 'vitest';

import { bindFamily, heldItem } from '../harness';
import { AIR } from '../identifiers';
import { LAVA_SPREAD_TICKS, NETHER, NETHER_LAVA_SPREAD_TICKS, WATER_SPREAD_TICKS } from '../rules/fluid';
import { copperFamily, liquidFamily, portalFamily, sculkFamily } from './world';

const origin = { x: 0, y: 1, z: 0 };

describe('liquidFamily', () => {
    it('spreads sideways on its tick and asks for the next one', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:water');
        harness.dimension.fill({ x: -2, y: 0, z: -2 }, { x: 2, y: 0, z: 2 }, 'minecraft:stone');
        harness.dimension.set(origin, 'minecraft:water', { liquid_depth: 0 });

        harness.tick(origin);

        expect(harness.dimension.identifierAt({ x: 1, y: 1, z: 0 })).toBe('minecraft:flowing_water');
        expect(harness.dimension.stateAt({ x: 1, y: 1, z: 0 }, 'liquid_depth')).toBe(1);
        expect(harness.dimension.scheduled.at(-1)).toEqual({
            position: { x: 1, y: 1, z: 0 },
            delay: WATER_SPREAD_TICKS
        });
    });

    it('falls instead of spreading when the space below is free', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:water');
        harness.dimension.set(origin, 'minecraft:water', { liquid_depth: 0 });

        harness.tick(origin);

        expect(harness.dimension.identifierAt({ x: 0, y: 0, z: 0 })).toBe('minecraft:flowing_water');
        expect(harness.dimension.identifierAt({ x: 1, y: 1, z: 0 })).toBe(AIR);
    });

    it('uses the nether lava rate inside the nether', () => {
        const overworld = bindFamily(liquidFamily, 'minecraft:lava');
        overworld.dimension.set(origin, 'minecraft:lava', { liquid_depth: 0 });
        overworld.place(origin);

        expect(overworld.dimension.scheduled).toEqual([{ position: origin, delay: LAVA_SPREAD_TICKS }]);

        const nether = bindFamily(liquidFamily, 'minecraft:lava', { dimension: NETHER });
        nether.dimension.set(origin, 'minecraft:lava', { liquid_depth: 0 });
        nether.place(origin);

        expect(nether.dimension.scheduled).toEqual([{ position: origin, delay: NETHER_LAVA_SPREAD_TICKS }]);
    });

    it('turns a lava source next to water into obsidian', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:lava');
        harness.dimension.set(origin, 'minecraft:lava', { liquid_depth: 0 });
        harness.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:water', { liquid_depth: 0 });

        harness.neighborChanged(origin, 'east');

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:obsidian');
    });

    it('turns flowing lava under water into stone and beside it into cobblestone', () => {
        const below = bindFamily(liquidFamily, 'minecraft:flowing_lava');
        below.dimension.set(origin, 'minecraft:flowing_lava', { liquid_depth: 2 });
        below.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:water', { liquid_depth: 0 });

        below.tick(origin);

        expect(below.dimension.identifierAt(origin)).toBe('minecraft:stone');

        const beside = bindFamily(liquidFamily, 'minecraft:flowing_lava');
        beside.dimension.set(origin, 'minecraft:flowing_lava', { liquid_depth: 2 });
        beside.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:water', { liquid_depth: 0 });

        beside.tick(origin);

        expect(beside.dimension.identifierAt(origin)).toBe('minecraft:cobblestone');
    });

    it('burns an item that falls into lava', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:lava');
        harness.dimension.set(origin, 'minecraft:lava', { liquid_depth: 0 });
        harness.dimension.addEntity('minecraft:item', origin);

        harness.stepOn(origin);

        expect(harness.dimension.entitiesAt(origin)).toEqual([]);
    });
});

describe('liquidFamily and buckets', () => {
    it('gives a water source up to an empty bucket and leaves a flow alone', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:water');
        harness.dimension.set(origin, 'minecraft:water', { liquid_depth: 0 });

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:bucket') })).toBe(true);

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:water_bucket']);

        harness.dimension.set(origin, 'minecraft:flowing_water', { liquid_depth: 3 });

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:bucket') })).toBeUndefined();
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:flowing_water');
    });

    it('fills a bucket from lava and refuses a bottle against it', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:lava');
        harness.dimension.set(origin, 'minecraft:lava', { liquid_depth: 0 });

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:glass_bottle') })).toBeUndefined();

        harness.interact(origin, { itemStack: heldItem('minecraft:bucket') });

        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:lava_bucket']);
    });

    it('scoops a bottle of water without taking the source', () => {
        const harness = bindFamily(liquidFamily, 'minecraft:water');
        harness.dimension.set(origin, 'minecraft:water', { liquid_depth: 0 });

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:glass_bottle') })).toBe(true);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:water');
        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:potion']);
    });
});

describe('portalFamily', () => {
    it('counts a player down to the trip and burns fire out over its ages', () => {
        const portal = bindFamily(portalFamily, 'minecraft:portal');
        portal.dimension.set(origin, 'minecraft:portal', { portal_axis: 'x' });

        portal.stepOn(origin);

        expect(portal.dimension.scheduled).toEqual([{ position: origin, delay: 80 }]);

        const fire = bindFamily(portalFamily, 'minecraft:fire');
        fire.dimension.set(origin, 'minecraft:fire', { age: 15 });

        fire.tick(origin);

        expect(fire.dimension.identifierAt(origin)).toBe(AIR);
    });

    it('turns a placed frame opposite its placer, so each direction gives its own facing', () => {
        // Java's `EndPortalFrameBlock.getStateForPlacement` faces the frame opposite the
        // player's horizontal direction, and the identity state mapping keeps that value in
        // Bedrock's `minecraft:cardinal_direction`. Without it every frame keeps the default
        // `south` and no ring can ever complete.
        const harness = bindFamily(portalFamily, 'minecraft:end_portal_frame');
        const placements = [
            { position: { x: 0, y: 1, z: 0 }, yaw: 180, facing: 'south' },
            { position: { x: 2, y: 1, z: 0 }, yaw: 0, facing: 'north' },
            { position: { x: 4, y: 1, z: 0 }, yaw: 90, facing: 'east' },
            { position: { x: 6, y: 1, z: 0 }, yaw: 270, facing: 'west' }
        ] as const;

        for (const { position, yaw, facing } of placements) {
            harness.dimension.set(position, 'minecraft:end_portal_frame', {
                end_portal_eye_bit: false,
                'minecraft:cardinal_direction': 'south'
            });
            harness.place(position, {
                placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 0, z: 0 }, yaw }
            });

            expect(harness.dimension.stateAt(position, 'minecraft:cardinal_direction')).toBe(facing);
        }
    });

    it('leaves a frame the world wrote on its default facing', () => {
        const harness = bindFamily(portalFamily, 'minecraft:end_portal_frame');
        harness.dimension.set(origin, 'minecraft:end_portal_frame', {
            end_portal_eye_bit: false,
            'minecraft:cardinal_direction': 'south'
        });

        harness.place(origin, { placedBy: undefined });

        expect(harness.dimension.stateAt(origin, 'minecraft:cardinal_direction')).toBe('south');
    });

    it('takes a held eye of ender into an empty frame once', () => {
        const harness = bindFamily(portalFamily, 'minecraft:end_portal_frame');
        harness.dimension.set(origin, 'minecraft:end_portal_frame', {
            end_portal_eye_bit: false,
            'minecraft:cardinal_direction': 'south'
        });

        const eye = heldItem('minecraft:ender_eye');
        // The richer answer: the click is consumed and it cost an eye, which the host takes
        // out of the player's inventory outside creative. The family has no inventory to
        // spend from, so saying so is all it can do.
        expect(harness.interact(origin, { itemStack: eye })).toEqual({ consumed: true, consumesHeldItem: true });
        expect(harness.dimension.stateAt(origin, 'end_portal_eye_bit')).toBe(true);
        expect(harness.interact(origin, { itemStack: eye })).toBeUndefined();
    });

    it('leaves a frame empty for a bare hand or anything but an eye', () => {
        // Vanilla fills a frame only from a held eye of ender. Before the check, any click
        // filled it, a bare hand included.
        const harness = bindFamily(portalFamily, 'minecraft:end_portal_frame');
        harness.dimension.set(origin, 'minecraft:end_portal_frame', {
            end_portal_eye_bit: false,
            'minecraft:cardinal_direction': 'south'
        });

        expect(harness.interact(origin)).toBeUndefined();
        expect(harness.interact(origin, { itemStack: heldItem('minecraft:stick') })).toBeUndefined();
        expect(harness.dimension.stateAt(origin, 'end_portal_eye_bit')).toBe(false);
    });
});

describe('sculkFamily', () => {
    it('walks a sensor through its three phases', () => {
        const harness = bindFamily(sculkFamily, 'minecraft:sculk_sensor');
        harness.dimension.set(origin, 'minecraft:sculk_sensor', { sculk_sensor_phase: 0 });

        harness.stepOn(origin);

        expect(harness.dimension.stateAt(origin, 'sculk_sensor_phase')).toBe(1);

        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'sculk_sensor_phase')).toBe(2);

        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'sculk_sensor_phase')).toBe(0);
    });

    it('shrieks once and goes quiet on its tick', () => {
        const harness = bindFamily(sculkFamily, 'minecraft:sculk_shrieker');
        harness.dimension.set(origin, 'minecraft:sculk_shrieker', { active: false, can_summon: true });

        harness.stepOn(origin);

        expect(harness.dimension.stateAt(origin, 'active')).toBe(true);

        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'active')).toBe(false);
    });

    it('gives experience for breaking sculk', () => {
        const harness = bindFamily(sculkFamily, 'minecraft:sculk');
        harness.dimension.set(origin, 'minecraft:sculk');

        harness.breakBlock(origin);

        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:xp_orb']);
    });
});

describe('copperFamily', () => {
    it('oxidizes a stage when the chance comes up and stops when it is waxed', () => {
        const harness = bindFamily(copperFamily, 'minecraft:copper_block');
        harness.dimension.set(origin, 'minecraft:copper_block');
        harness.dimension.queueRandom(0.9, 0);

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:copper_block');

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:exposed_copper');

        const waxed = bindFamily(copperFamily, 'minecraft:waxed_copper');
        waxed.dimension.set(origin, 'minecraft:waxed_copper');
        waxed.dimension.queueRandom(0);

        waxed.randomTick(origin);

        expect(waxed.dimension.identifierAt(origin)).toBe('minecraft:waxed_copper');
    });

    it('walks the whole chain from unoxidized to oxidized', () => {
        const stages = ['minecraft:copper_block', 'minecraft:exposed_copper', 'minecraft:weathered_copper'];
        const seen: string[] = [];

        for (const stage of stages) {
            const harness = bindFamily(copperFamily, stage);
            harness.dimension.set(origin, stage);
            harness.dimension.queueRandom(0);
            harness.randomTick(origin);
            seen.push(harness.dimension.identifierAt(origin));
        }

        expect(seen).toEqual(['minecraft:exposed_copper', 'minecraft:weathered_copper', 'minecraft:oxidized_copper']);
    });

    it('waxes with honeycomb and refuses a block that is already waxed', () => {
        const harness = bindFamily(copperFamily, 'minecraft:exposed_copper');
        harness.dimension.set(origin, 'minecraft:exposed_copper');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:honeycomb') })).toBe(true);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:waxed_exposed_copper');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:honeycomb') })).toBeUndefined();
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:waxed_exposed_copper');
    });

    it('scrapes the wax off first and the oxidation after', () => {
        const harness = bindFamily(copperFamily, 'minecraft:waxed_weathered_copper');
        harness.dimension.set(origin, 'minecraft:waxed_weathered_copper');

        harness.interact(origin, { itemStack: heldItem('minecraft:golden_axe') });

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:weathered_copper');
        expect(harness.dimension.sounds.at(-1)?.name).toBe('copper.wax.off');

        harness.interact(origin, { itemStack: heldItem('minecraft:golden_axe') });

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:exposed_copper');
        expect(harness.dimension.sounds.at(-1)?.name).toBe('scrape');

        harness.interact(origin, { itemStack: heldItem('minecraft:golden_axe') });

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:copper_block');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:golden_axe') })).toBeUndefined();
    });

    it('leaves a bare hand and an unrelated item alone', () => {
        const harness = bindFamily(copperFamily, 'minecraft:copper_block');
        harness.dimension.set(origin, 'minecraft:copper_block');

        expect(harness.interact(origin)).toBeUndefined();
        expect(harness.interact(origin, { itemStack: heldItem('minecraft:stick') })).toBeUndefined();
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:copper_block');
    });

    it('flips a copper bulb on the rising edge and holds it on the falling one', () => {
        const harness = bindFamily(copperFamily, 'minecraft:copper_bulb');
        harness.dimension.set(origin, 'minecraft:copper_bulb', { lit: false, powered_bit: false });

        harness.redstone(origin, 15);

        expect(harness.dimension.stateAt(origin, 'lit')).toBe(true);

        harness.redstone(origin, 0);

        expect(harness.dimension.stateAt(origin, 'lit')).toBe(true);

        harness.redstone(origin, 15);

        expect(harness.dimension.stateAt(origin, 'lit')).toBe(false);
    });
});
