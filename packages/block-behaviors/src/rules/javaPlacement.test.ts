import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import type { PlacementInput } from './javaPlacement';
import {
    nearestLookingDirections,
    orderedByNearest,
    placedStateOf,
    placementRuleOf,
    withClickedHalf
} from './javaPlacement';

const at: BlockPosition = { x: 0, y: 5, z: 0 };
const around = {
    up: { x: 0, y: 6, z: 0 },
    down: { x: 0, y: 4, z: 0 },
    north: { x: 0, y: 5, z: -1 },
    south: { x: 0, y: 5, z: 1 },
    west: { x: -1, y: 5, z: 0 },
    east: { x: 1, y: 5, z: 0 }
} as const satisfies Record<BlockFace, BlockPosition>;

/** A world with stone on the given sides of the placement. */
const worldWith = (...solid: readonly BlockFace[]) => {
    const world = createVoxelWorld().overworld;
    for (const face of solid) world.set(around[face], 'minecraft:stone');
    return world;
};

const input = (
    world: PlacementInput['world'],
    face: BlockFace,
    look: { readonly yaw?: number; readonly pitch?: number } = {}
): PlacementInput => ({
    world,
    position: at,
    face,
    yaw: look.yaw ?? 0,
    pitch: look.pitch ?? 0,
    sneaking: false,
    replacingClicked: false
});

/** The Bedrock block and states a Java state maps to, which is what a placement should produce. */
const bedrock = (javaId: string, properties: Readonly<Record<string, string>>) => {
    const mapped = javaBlockStateToBedrock(javaId, properties);
    if (mapped.kind !== 'mapped' && mapped.kind !== 'loss') throw new Error(`${javaId} maps to nothing`);
    return { identifier: mapped.bedrock.name, states: mapped.bedrock.states };
};

/** Places a Java block, starting from its default Bedrock state. */
const place = (javaId: string, placement: PlacementInput) => {
    const start = bedrock(javaId, {});
    return placedStateOf(start.identifier, start.states, placement);
};

describe('the directions a placement tries', () => {
    it('orders the six by the look, as Java does', () => {
        expect(orderedByNearest(0, 0)[0]).toBe('south');
        expect(orderedByNearest(90, 0)[0]).toBe('west');
        expect(orderedByNearest(0, 80)[0]).toBe('down');
        expect(orderedByNearest(0, -80)[0]).toBe('up');
        expect(orderedByNearest(30, 10)).toHaveLength(6);
    });

    it('tries the clicked block first', () => {
        expect(nearestLookingDirections(input(worldWith(), 'east'))[0]).toBe('west');
    });
});

describe('placedStateOf', () => {
    it('leaves a block with no rule alone', () => {
        expect(place('minecraft:stone', input(worldWith('down'), 'up'))).toBeUndefined();
    });

    it('faces a furnace-like block away from where the placer looks', () => {
        expect(place('minecraft:carved_pumpkin', input(worldWith('down'), 'up', { yaw: 90 }))).toEqual(
            bedrock('minecraft:carved_pumpkin', { facing: 'east' })
        );
        expect(place('minecraft:anvil', input(worldWith('down'), 'up', { yaw: 0 }))).toEqual(
            bedrock('minecraft:anvil', { facing: 'west' })
        );
    });

    it('turns a dispenser toward the placer and an observer away, in all six directions', () => {
        const lookingDown = input(worldWith('down'), 'up', { pitch: 80 });
        expect(place('minecraft:dispenser', lookingDown)).toEqual(bedrock('minecraft:dispenser', { facing: 'up' }));
        expect(place('minecraft:observer', lookingDown)).toEqual(bedrock('minecraft:observer', { facing: 'down' }));
    });

    it('points a hopper into the side it was clicked against, and down from a top or bottom', () => {
        expect(place('minecraft:hopper', input(worldWith('south'), 'north'))).toEqual(
            bedrock('minecraft:hopper', { facing: 'south' })
        );
        expect(place('minecraft:hopper', input(worldWith('down'), 'up'))).toEqual(
            bedrock('minecraft:hopper', { facing: 'down' })
        );
    });

    it('sets a button on the floor, the ceiling or a wall by what holds it', () => {
        expect(place('minecraft:stone_button', input(worldWith('down'), 'up', { pitch: 60 }))).toEqual(
            bedrock('minecraft:stone_button', { face: 'floor', facing: 'south' })
        );
        expect(place('minecraft:stone_button', input(worldWith('up'), 'down', { pitch: -60 }))).toEqual(
            bedrock('minecraft:stone_button', { face: 'ceiling', facing: 'south' })
        );
        expect(place('minecraft:stone_button', input(worldWith('south'), 'north'))).toEqual(
            bedrock('minecraft:stone_button', { face: 'wall', facing: 'north' })
        );
        expect(place('minecraft:stone_button', input(worldWith(), 'north'))).toBeNull();
    });

    it('refuses a floor button over a bottom slab, whose top face is not sturdy', () => {
        const voxel = createVoxelWorld().overworld;
        voxel.set(around.down, 'minecraft:stone_slab', { 'minecraft:vertical_half': 'bottom' });
        const world = Object.assign(voxel, {
            hasSturdyTopFace: (block: HookBlock): boolean => block.identifier !== 'minecraft:stone_slab'
        });

        expect(place('minecraft:stone_button', input(world, 'up', { pitch: 60 }))).toBeNull();
    });

    it('slab half and stair flip follow the click before the block is written', () => {
        expect(withClickedHalf({ 'minecraft:vertical_half': 'bottom' }, 'down', undefined)).toEqual({
            'minecraft:vertical_half': 'top'
        });
        expect(withClickedHalf({ upside_down_bit: false }, 'north', { x: 0.5, y: 0.8, z: 0 })).toEqual({
            upside_down_bit: true
        });
    });

    it('stands a sign on the floor facing the placer and hangs one on a wall', () => {
        expect(place('minecraft:oak_sign', input(worldWith('down'), 'up', { yaw: 0, pitch: 60 }))).toEqual(
            bedrock('minecraft:oak_sign', { rotation: '8' })
        );
        expect(place('minecraft:oak_sign', input(worldWith('south'), 'north'))).toEqual(
            bedrock('minecraft:oak_wall_sign', { facing: 'north' })
        );
        expect(place('minecraft:oak_sign', input(worldWith(), 'north'))).toBeNull();
    });

    it('turns a coral fan into a wall fan on a wall', () => {
        expect(place('minecraft:tube_coral_fan', input(worldWith('south'), 'north'))).toEqual(
            bedrock('minecraft:tube_coral_wall_fan', { facing: 'north' })
        );
    });

    it('puts a ladder on the wall it was clicked against, and not against a ladder facing that way', () => {
        expect(place('minecraft:ladder', input(worldWith('south'), 'north'))).toEqual(
            bedrock('minecraft:ladder', { facing: 'north' })
        );
        const world = worldWith('west');
        const ladder = bedrock('minecraft:ladder', { facing: 'north' });
        world.set(around.south, ladder.identifier, ladder.states);
        expect(place('minecraft:ladder', input(world, 'north'))).toBeNull();
    });

    it('hangs a bell between two walls when both hold it', () => {
        expect(place('minecraft:bell', input(worldWith('north', 'south'), 'north'))).toEqual(
            bedrock('minecraft:bell', { attachment: 'double_wall', facing: 'south' })
        );
        expect(place('minecraft:bell', input(worldWith('south'), 'north'))).toEqual(
            bedrock('minecraft:bell', { attachment: 'single_wall', facing: 'south' })
        );
    });

    it('makes placed leaves persistent', () => {
        expect(place('minecraft:oak_leaves', input(worldWith('down'), 'up'))).toEqual(
            bedrock('minecraft:oak_leaves', { persistent: 'true' })
        );
    });

    it('faces a bed the way the placer looks, with room for its head', () => {
        expect(place('minecraft:red_bed', input(worldWith('down'), 'up', { yaw: 180 }))).toEqual(
            bedrock('minecraft:red_bed', { facing: 'north' })
        );
        expect(place('minecraft:red_bed', input(worldWith('down', 'north'), 'up', { yaw: 180 }))).toBeNull();
    });
});

describe('placementRuleOf', () => {
    it('picks the wall variant before its standing block, and nothing for a piston head', () => {
        expect(placementRuleOf('minecraft:oak_wall_sign')).toBe('WallSignBlock');
        expect(placementRuleOf('minecraft:oak_sign')).toBe('StandingSignBlock');
        expect(placementRuleOf('minecraft:oak_wall_hanging_sign')).toBe('WallHangingSignBlock');
        expect(placementRuleOf('minecraft:piston_head')).toBeUndefined();
    });
});
