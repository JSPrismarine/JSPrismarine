/** The navigation, movement and jump components a mob's path finder and controller read. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { EntityHooks } from '../hooks';
import { asList, booleanAt, isRecord, numberAt } from './schemas';
import { parseTimeRange } from './shared';

/** What `minecraft:navigation.*` declares; every field is a capability of the path finder. */
export interface NavigationParams {
    /** The navigation flavor, such as `walk` or `generic`. */
    readonly kind: string;
    readonly canPathOverWater: boolean;
    readonly canPathOverLava: boolean;
    readonly canPathFromAir: boolean;
    readonly canFloat: boolean;
    readonly canSink: boolean;
    readonly canSwim: boolean;
    readonly canWalk: boolean;
    readonly canWalkInLava: boolean;
    readonly canFly: boolean;
    readonly canBreach: boolean;
    readonly canJump: boolean;
    readonly canOpenDoors: boolean;
    readonly canOpenIronDoors: boolean;
    readonly canPassDoors: boolean;
    readonly canBreakDoors: boolean;
    readonly usingDoorAnnotation: boolean;
    readonly avoidWater: boolean;
    readonly avoidSun: boolean;
    readonly avoidPortals: boolean;
    readonly avoidDamageBlocks: boolean;
    readonly isAmphibious: boolean;
    /** Block names and tags the path finder treats as impassable. */
    readonly blocksToAvoid: readonly unknown[];
}

/** Builds one `minecraft:navigation.<kind>` component. */
export const navigationComponent = (kind: string): ComponentFactory<EntityHooks, NavigationParams> => ({
    name: `minecraft:navigation.${kind}`,
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        return accepted({
            kind,
            canPathOverWater: booleanAt(value, 'can_path_over_water', false),
            canPathOverLava: booleanAt(value, 'can_path_over_lava', false),
            canPathFromAir: booleanAt(value, 'can_path_from_air', false),
            canFloat: booleanAt(value, 'can_float', false),
            canSink: booleanAt(value, 'can_sink', true),
            canSwim: booleanAt(value, 'can_swim', kind === 'swim'),
            canWalk: booleanAt(value, 'can_walk', kind !== 'fly' && kind !== 'hover' && kind !== 'float'),
            canWalkInLava: booleanAt(value, 'can_walk_in_lava', false),
            canFly: booleanAt(value, 'can_fly', kind === 'fly' || kind === 'hover' || kind === 'float'),
            canBreach: booleanAt(value, 'can_breach', false),
            canJump: booleanAt(value, 'can_jump', true),
            canOpenDoors: booleanAt(value, 'can_open_doors', false),
            canOpenIronDoors: booleanAt(value, 'can_open_iron_doors', false),
            canPassDoors: booleanAt(value, 'can_pass_doors', true),
            canBreakDoors: booleanAt(value, 'can_break_doors', false),
            usingDoorAnnotation: booleanAt(value, 'using_door_annotation', false),
            avoidWater: booleanAt(value, 'avoid_water', false),
            avoidSun: booleanAt(value, 'avoid_sun', false),
            avoidPortals: booleanAt(value, 'avoid_portals', false),
            avoidDamageBlocks: booleanAt(value, 'avoid_damage_blocks', false),
            isAmphibious: booleanAt(value, 'is_amphibious', false),
            blocksToAvoid: asList(value.blocks_to_avoid)
        });
    },
    create: () => ({})
});

/** What a `minecraft:movement.*` component declares. */
export interface MovementModeParams {
    /** The movement flavor, such as `basic` or `sway`. */
    readonly kind: string;
    /** The most degrees the entity turns per tick. */
    readonly maxTurn: number;
    /**
     * How long `minecraft:movement.jump` waits on the ground between two hops, in seconds,
     * as a `[min, max]` pair. Present only on the `jump` flavor.
     */
    readonly jumpDelay?: readonly [number, number];
}

/** Builds one `minecraft:movement.<kind>` component. */
export const movementComponent = (
    kind: string,
    defaultMaxTurn = 30
): ComponentFactory<EntityHooks, MovementModeParams> => ({
    name: `minecraft:movement.${kind}`,
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  kind,
                  maxTurn: numberAt(value, 'max_turn', defaultMaxTurn),
                  ...(kind === 'jump' ? { jumpDelay: parseTimeRange(value.jump_delay) } : {})
              })
            : rejected('expected an object'),
    create: () => ({})
});

/** What `minecraft:jump.static` declares. */
export interface JumpParams {
    readonly jumpPower: number;
}

/** `minecraft:jump.static`, the fixed jump height 79 entities use. */
export const jumpStatic: ComponentFactory<EntityHooks, JumpParams> = {
    name: 'minecraft:jump.static',
    hooks: [],
    schema: (value) =>
        isRecord(value) ? accepted({ jumpPower: numberAt(value, 'jump_power', 0.42) }) : rejected('expected an object'),
    create: () => ({})
};
