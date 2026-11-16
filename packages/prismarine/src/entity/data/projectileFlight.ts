import type { EntityPosition } from '@jsprismarine/entities';

import { numberOf } from './numberOf';

/**
 * How a projectile's velocity changes each tick, around the move that carries it along.
 *
 * A vanilla projectile follows its Java class's tick, which decides both the numbers and when
 * they apply relative to the move. Any other projectile, such as an add-on's, follows the
 * `gravity` and `inertia` of its Bedrock `minecraft:projectile` component.
 */

/** Java's `applyInertia` takes a float, so its drag carries a float's rounding. */
const float = Math.fround;

/** The ways a projectile's tick orders its gravity, its drag and its move. */
type FlightOrder =
    /** Java's `AbstractArrow.tick`: water drag, the move, then air drag and gravity. */
    | 'arrow'
    /** Java's `ThrowableProjectile.tick`: gravity, then drag, then the move. */
    | 'throwable'
    /** Java's `ShulkerBullet.tick` with no target: gravity, then the move, with no drag. */
    | 'bullet'
    /** Java's `LlamaSpit.tick`: the move, then air drag and gravity. */
    | 'spit'
    /** The Bedrock component: the move, then gravity, then the component's inertia. */
    | 'component';

/** The numbers and the order one projectile flies by. */
export interface ProjectileFlight {
    readonly order: FlightOrder;
    /** Blocks per tick taken off the vertical speed each tick. */
    readonly gravity: number;
    /** The share of its speed the projectile keeps per tick out of water. */
    readonly airDrag: number;
    /** The share of its speed the projectile keeps per tick in water. */
    readonly waterDrag: number;
}

/** `AbstractArrow.getDefaultGravity`, `getAirDrag` and `getWaterInertia`. */
const ARROW: ProjectileFlight = { order: 'arrow', gravity: 0.05, airDrag: float(0.99), waterDrag: float(0.6) };

/** `ThrowableProjectile.getDefaultGravity`, `getAirDrag` and the 0.8 of its `applyInertia` in water. */
const THROWABLE: ProjectileFlight = { order: 'throwable', gravity: 0.03, airDrag: float(0.99), waterDrag: float(0.8) };

/** Java's flight for each vanilla projectile, by the Bedrock type it spawns as. */
const JAVA_FLIGHT: ReadonlyMap<string, ProjectileFlight> = new Map([
    ['minecraft:arrow', ARROW],
    // `ThrownTrident.getWaterInertia`.
    ['minecraft:thrown_trident', { ...ARROW, waterDrag: float(0.99) }],
    ['minecraft:snowball', THROWABLE],
    ['minecraft:egg', THROWABLE],
    ['minecraft:ender_pearl', THROWABLE],
    // `ThrownExperienceBottle.getDefaultGravity`.
    ['minecraft:xp_bottle', { ...THROWABLE, gravity: 0.07 }],
    // `AbstractThrownPotion.getDefaultGravity`.
    ['minecraft:splash_potion', { ...THROWABLE, gravity: 0.05 }],
    ['minecraft:lingering_potion', { ...THROWABLE, gravity: 0.05 }],
    // `ShulkerBullet.getDefaultGravity`; Java's bullet applies no drag.
    ['minecraft:shulker_bullet', { order: 'bullet', gravity: 0.04, airDrag: 1, waterDrag: 1 }],
    // `LlamaSpit.getDefaultGravity` and `getAirDrag`; Java discards spit that enters water.
    ['minecraft:llama_spit', { order: 'spit', gravity: 0.06, airDrag: float(0.99), waterDrag: float(0.99) }]
]);

/** The gravity Bedrock's projectile component falls back to when it names none. */
const COMPONENT_GRAVITY = 0.03;

/** The inertia Bedrock's projectile component falls back to in the air. */
const COMPONENT_AIR_INERTIA = 0.99;

/** The inertia Bedrock's projectile component falls back to in a liquid. */
const COMPONENT_LIQUID_INERTIA = 0.6;

/**
 * The flight a projectile follows.
 * @param identifier - The Bedrock entity type.
 * @param params - Its `minecraft:projectile` component, read for a type Java has no class for.
 * @returns Java's flight for a vanilla projectile, otherwise the component's.
 */
export const projectileFlight = (identifier: string, params: Readonly<Record<string, unknown>>): ProjectileFlight =>
    JAVA_FLIGHT.get(identifier) ?? {
        order: 'component',
        gravity: numberOf(params.gravity, COMPONENT_GRAVITY),
        airDrag: numberOf(params.air_inertia, numberOf(params.inertia, COMPONENT_AIR_INERTIA)),
        waterDrag: numberOf(params.liquid_inertia, COMPONENT_LIQUID_INERTIA)
    };

const scaled = (velocity: EntityPosition, factor: number): EntityPosition => ({
    x: velocity.x * factor,
    y: velocity.y * factor,
    z: velocity.z * factor
});

const fallen = (velocity: EntityPosition, gravity: number): EntityPosition => ({
    ...velocity,
    y: velocity.y - gravity
});

/**
 * The velocity a projectile moves by this tick, from the one it carried out of the last.
 * @param flight - The projectile's flight.
 * @param velocity - Its velocity at the start of the tick.
 * @param inWater - Whether it is in water (for a component flight, in any liquid).
 * @returns The velocity of this tick's move.
 */
export const velocityBeforeMove = (
    flight: ProjectileFlight,
    velocity: EntityPosition,
    inWater: boolean
): EntityPosition => {
    switch (flight.order) {
        case 'arrow':
            return inWater ? scaled(velocity, flight.waterDrag) : velocity;
        case 'throwable':
            return scaled(fallen(velocity, flight.gravity), inWater ? flight.waterDrag : flight.airDrag);
        case 'bullet':
            return fallen(velocity, flight.gravity);
        case 'spit':
        case 'component':
            return velocity;
    }
};

/**
 * The velocity a projectile carries into the next tick, after this tick's move.
 * @param flight - The projectile's flight.
 * @param velocity - The velocity it moved by this tick.
 * @param inWater - Whether it is in water (for a component flight, in any liquid).
 * @returns The velocity it starts the next tick with.
 */
export const velocityAfterMove = (
    flight: ProjectileFlight,
    velocity: EntityPosition,
    inWater: boolean
): EntityPosition => {
    switch (flight.order) {
        case 'arrow':
            return fallen(inWater ? velocity : scaled(velocity, flight.airDrag), flight.gravity);
        case 'spit':
            return fallen(scaled(velocity, flight.airDrag), flight.gravity);
        case 'component':
            return scaled(fallen(velocity, flight.gravity), inWater ? flight.waterDrag : flight.airDrag);
        case 'throwable':
        case 'bullet':
            return velocity;
    }
};
