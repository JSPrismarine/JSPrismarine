import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';

import type { EntityInstance } from '../entityInstance';
import type { EntityHooks, EntityPosition } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import { evaluateFilter } from '../filters';
import { booleanAt, isRecord, numberAt, parseFilterValue } from './schemas';

/** The half-widths of the area from which a teleport destination is drawn. */
export interface RandomTeleportCube {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Parameters for `minecraft:teleport`. */
export interface TeleportParams {
    readonly darkTeleportChance: number;
    readonly lightTeleportChance: number;
    readonly maxRandomTeleportTime: number;
    readonly minRandomTeleportTime: number;
    readonly projectileFilter: Filter | undefined;
    readonly randomTeleportCube: RandomTeleportCube;
    readonly randomTeleports: boolean;
    readonly targetDistance: number;
    readonly targetTeleportChance: number;
    readonly teleportsOnProjectileHit: boolean;
}

interface TeleportState {
    randomTeleportTicks: number;
}

const DEFAULT_TELEPORT_CUBE = { x: 32, y: 16, z: 32 };

/** `minecraft:teleport`, which handles timed, target-driven, and projectile evasion teleports. */
export const teleport: ComponentFactory<EntityHooks, TeleportParams> = {
    name: 'minecraft:teleport',
    hooks: ['onInitialize', 'onTick', 'onProjectileHit'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');

        const cube = teleportCubeOf(value.random_teleport_cube);
        if (cube === undefined) return rejected('random_teleport_cube must contain three non-negative numbers');

        const minRandomTeleportTime = numberAt(value, 'min_random_teleport_time', 0);
        const maxRandomTeleportTime = numberAt(value, 'max_random_teleport_time', 20);
        if (
            !Number.isFinite(minRandomTeleportTime) ||
            !Number.isFinite(maxRandomTeleportTime) ||
            minRandomTeleportTime < 0 ||
            maxRandomTeleportTime < minRandomTeleportTime
        )
            return rejected('random teleport times must be non-negative and max must be at least min');

        const darkTeleportChance = numberAt(value, 'dark_teleport_chance', 0.01);
        const lightTeleportChance = numberAt(value, 'light_teleport_chance', 0.01);
        const targetTeleportChance = numberAt(value, 'target_teleport_chance', 1);
        if (![darkTeleportChance, lightTeleportChance, targetTeleportChance].every(isChance))
            return rejected('teleport chances must be finite numbers between 0 and 1');

        const targetDistance = numberAt(value, 'target_distance', 16);
        if (!Number.isFinite(targetDistance) || targetDistance < 0)
            return rejected('target_distance must be a non-negative number');

        let projectileFilter: Filter | undefined;
        if (value.projectile_filter !== undefined) {
            const parsed = parseFilterValue(value.projectile_filter, 'minecraft:teleport projectile_filter');
            if (!parsed.ok) return parsed;
            projectileFilter = parsed.value;
        }

        return accepted({
            darkTeleportChance,
            lightTeleportChance,
            maxRandomTeleportTime,
            minRandomTeleportTime,
            projectileFilter,
            randomTeleportCube: cube,
            randomTeleports: booleanAt(value, 'random_teleports', true),
            targetDistance,
            targetTeleportChance,
            teleportsOnProjectileHit: booleanAt(value, 'teleports_on_projectile_hit', false)
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, TeleportState>();

        return {
            onInitialize: (entity) => {
                states.set(entity, { randomTeleportTicks: nextRandomTeleportTicks(entity, params) });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;

                const actuator = entity.actuator;
                const target = actuator?.targetPosition?.();
                if (
                    actuator !== undefined &&
                    target !== undefined &&
                    distance(actuator.position(), target) > params.targetDistance &&
                    entity.random.next() < params.targetTeleportChance
                ) {
                    const destination = actuator.randomPosition?.(
                        target,
                        params.targetDistance,
                        params.targetDistance,
                        params.targetDistance
                    );
                    if (destination !== undefined && teleportTo(actuator, destination)) {
                        state.randomTeleportTicks = nextRandomTeleportTicks(entity, params);
                        return;
                    }
                }

                if (!params.randomTeleports) return;
                state.randomTeleportTicks -= 1;
                if (state.randomTeleportTicks > 0) return;
                state.randomTeleportTicks = nextRandomTeleportTicks(entity, params);

                const lightLevel = entity.filterContext().self.measure?.('light_level');
                if (lightLevel === undefined) return;
                const chance = lightLevel > 7 ? params.lightTeleportChance : params.darkTeleportChance;
                if (entity.random.next() >= chance) return;

                randomTeleport(entity, params.randomTeleportCube);
            },
            onProjectileHit: (entity, projectile) => {
                if (!params.teleportsOnProjectileHit) return false;
                if (
                    params.projectileFilter !== undefined &&
                    !evaluateFilter(params.projectileFilter, {
                        ...entity.filterContext(),
                        self: projectile,
                        other: projectile,
                        damager: projectile
                    })
                )
                    return false;
                return randomTeleport(entity, params.randomTeleportCube);
            }
        };
    }
};

/** Parses the array and object forms of the Bedrock random teleport cube. */
const teleportCubeOf = (value: unknown): RandomTeleportCube | undefined => {
    let x: unknown;
    let y: unknown;
    let z: unknown;
    if (Array.isArray(value) && value.length === 3) [x, y, z] = value;
    else if (isRecord(value)) ({ x, y, z } = value);
    else if (value === undefined) return DEFAULT_TELEPORT_CUBE;
    else return undefined;

    if (
        typeof x !== 'number' ||
        !Number.isFinite(x) ||
        x < 0 ||
        typeof y !== 'number' ||
        !Number.isFinite(y) ||
        y < 0 ||
        typeof z !== 'number' ||
        !Number.isFinite(z) ||
        z < 0
    )
        return undefined;
    return { x, y, z };
};

/** Whether one numeric component parameter is a probability. */
const isChance = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

/** Draws the next random teleport delay, in server ticks. */
const nextRandomTeleportTicks = (entity: EntityInstance, params: TeleportParams): number => {
    const minimum = Math.round(params.minRandomTeleportTime * TICKS_PER_SECOND);
    const maximum = Math.round(params.maxRandomTeleportTime * TICKS_PER_SECOND);
    return Math.max(1, minimum + Math.floor(entity.random.next() * (maximum - minimum + 1)));
};

/** Tries a reachable random position around the entity. */
const randomTeleport = (entity: EntityInstance, cube: RandomTeleportCube): boolean => {
    const actuator = entity.actuator;
    if (actuator?.randomPosition === undefined) return false;
    const destination = actuator.randomPosition(actuator.position(), cube.x, cube.y, cube.z);
    return destination !== undefined && teleportTo(actuator, destination);
};

/** Moves an entity when its host has a live teleport route. */
const teleportTo = (actuator: NonNullable<EntityInstance['actuator']>, destination: EntityPosition): boolean => {
    if (actuator.teleportTo === undefined) return false;
    actuator.teleportTo(destination);
    return true;
};

/** The distance between two entity positions. */
const distance = (first: EntityPosition, second: EntityPosition): number =>
    Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
