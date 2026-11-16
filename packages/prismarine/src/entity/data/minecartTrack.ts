/**
 * How a minecart runs along a rail, after Java 26.3's `OldMinecartBehavior`, which every minecart
 * uses while the experimental minecart improvements are off.
 *
 * Each tick `OldMinecartBehavior.tick` applies the cart's gravity and looks for a rail in the
 * block it is in or the one under it. On a rail, `moveAlongTrack` turns the cart's speed onto the
 * rail's direction, pulls it down a slope, brakes it on an unpowered powered rail, moves it, sets
 * it back on the rail's line and slows it, and an activator rail then calls the cart's
 * `activateMinecart`. Off a rail, `AbstractMinecart.comeOffTrack` moves it as a plain body, which
 * the runtime's own travel step does.
 *
 * Bedrock writes the rail's shape as `rail_direction`, whose values count Java's `RailShape` in
 * the same order, and a powered or activator rail's power as `rail_data_bit`.
 */
import type { EntityPosition } from '@jsprismarine/entities';

/** Java's `RailShape`, indexed by Bedrock's `rail_direction`. */
const RAIL_SHAPES = [
    'north_south',
    'east_west',
    'ascending_east',
    'ascending_west',
    'ascending_north',
    'ascending_south',
    'south_east',
    'south_west',
    'north_west',
    'north_east'
] as const;

/** One of Java's ten rail shapes. */
export type RailShape = (typeof RAIL_SHAPES)[number];

/** The rails of Java's `minecraft:rails` block tag, by their Bedrock names. */
const RAILS: ReadonlySet<string> = new Set([
    'minecraft:rail',
    'minecraft:golden_rail',
    'minecraft:detector_rail',
    'minecraft:activator_rail'
]);

/** Java's powered rail, which Bedrock calls the golden rail. */
const POWERED_RAIL = 'minecraft:golden_rail';

/** The rail that calls a cart's `activateMinecart`. */
export const ACTIVATOR_RAIL = 'minecraft:activator_rail';

/** The state Bedrock keeps a powered or activator rail's `POWERED` in. */
const POWERED_STATE = 'rail_data_bit';

/** `OldMinecartBehavior.moveAlongTrack`'s pull down a slope, a fifth of it in water. */
const SLOPE_PULL = 0.0078125;
const WATER_SLOPE_SHARE = 0.2;

/** The fastest `moveAlongTrack` turns a cart's speed onto the rail. */
const TRACK_SPEED_LIMIT = 2;

/** Below this speed an unpowered powered rail stops a cart, and above it halves its speed. */
const BRAKE_STOP_SPEED = 0.03;
const BRAKE_SHARE = 0.5;

/** The share of its speed a ridden cart moves by each tick. */
const RIDDEN_MOVE_SHARE = 0.75;

/** `OldMinecartBehavior.getMaxSpeed`: the most a cart moves a tick, and in water. */
const MAX_SPEED = 0.4;
const WATER_MAX_SPEED = 0.2;

/** `OldMinecartBehavior.getSlowdownFactor`: the share of its speed an empty cart keeps a tick. */
export const EMPTY_SLOWDOWN = 0.96;

/** `OldMinecartBehavior.getSlowdownFactor`: the share of its speed a ridden cart keeps a tick. */
export const RIDDEN_SLOWDOWN = 0.997;

/**
 * `AbstractMinecartContainer.applyNaturalSlowdown`: a full container cart's drag, and how much
 * each signal level its container is short of full takes off it.
 */
const CONTAINER_SLOWDOWN = 0.98;
const CONTAINER_SLOWDOWN_PER_SIGNAL = 0.001;
const MAX_SIGNAL = 15;

/** `AbstractMinecart.applyNaturalSlowdown`'s further drag in water. */
const WATER_SLOWDOWN = 0.95;

/** How much of a cart's drop in height along the rail `moveAlongTrack` turns into speed. */
const HEIGHT_TO_SPEED = 0.05;

/** A powered rail's boost to a moving cart, and the speed it counts as moving above. */
const POWERED_BOOST = 0.06;
const POWERED_MOVING_SPEED = 0.01;

/** The push a powered rail gives a cart at rest against a block at one end. */
const POWERED_START = 0.02;

/** `getPos` sets a cart this far above the bottom of its rail's block. */
const RAIL_HEIGHT = 0.0625;

/** A block offset. */
interface Offset {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

const NORTH: Offset = { x: 0, y: 0, z: -1 };
const SOUTH: Offset = { x: 0, y: 0, z: 1 };
const WEST: Offset = { x: -1, y: 0, z: 0 };
const EAST: Offset = { x: 1, y: 0, z: 0 };
const below = (offset: Offset): Offset => ({ ...offset, y: offset.y - 1 });

/** `AbstractMinecart.EXITS`: the two ends of each rail shape, from the rail's raised block. */
const EXITS: Readonly<Record<RailShape, readonly [Offset, Offset]>> = {
    north_south: [NORTH, SOUTH],
    east_west: [WEST, EAST],
    ascending_east: [below(WEST), EAST],
    ascending_west: [WEST, below(EAST)],
    ascending_north: [NORTH, below(SOUTH)],
    ascending_south: [below(NORTH), SOUTH],
    south_east: [SOUTH, EAST],
    south_west: [SOUTH, WEST],
    north_west: [NORTH, WEST],
    north_east: [NORTH, EAST]
};

/** A block as the world reports it. */
export interface TrackBlock {
    readonly identifier: string;
    readonly states: Readonly<Record<string, unknown>>;
}

/** The rail shape of a block, or undefined for a block that is not a rail. */
export const railShapeOf = (block: TrackBlock | undefined): RailShape | undefined => {
    if (block === undefined || !RAILS.has(block.identifier)) return undefined;
    const direction = block.states.rail_direction;
    return RAIL_SHAPES[typeof direction === 'number' ? direction : 0];
};

/** Whether a powered or activator rail is powered. */
export const isPoweredRail = (block: TrackBlock): boolean => block.states[POWERED_STATE] === true;

/** What a cart's track step reads of the world and how it moves the cart. */
export interface TrackHost {
    block(at: EntityPosition): TrackBlock | undefined;
    /** Whether a block conducts redstone, which a powered rail pushes a resting cart away from. */
    isRedstoneConductor(at: EntityPosition): boolean;
    /** Moves the cart from `from` by `by` as far as the blocks let it, and returns where it ends. */
    move(from: EntityPosition, by: EntityPosition): EntityPosition;
}

/** The cart a track step moves: where it is and its velocity, which the step rewrites. */
export interface TrackCart {
    position: EntityPosition;
    velocity: EntityPosition;
    /** Whether anything rides the cart. */
    readonly ridden: boolean;
    readonly inWater: boolean;
    /**
     * The share of its speed the cart keeps each tick before water's: `getSlowdownFactor`, or a
     * container cart's `AbstractMinecartContainer.applyNaturalSlowdown`.
     */
    readonly slowdown: number;
}

const floorOf = (position: EntityPosition): EntityPosition => ({
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
});

/**
 * `AbstractMinecart.getCurrentBlockPosOrRailBelow`: the block a cart is in, or the one under it
 * when that one is a rail.
 */
export const railPositionOf = (position: EntityPosition, host: Pick<TrackHost, 'block'>): EntityPosition => {
    const at = floorOf(position);
    const under = { ...at, y: at.y - 1 };
    return railShapeOf(host.block(under)) === undefined ? at : under;
};

/** `OldMinecartBehavior.getPos`: the point on the rail at or under a position, or undefined off a rail. */
export const railPoint = (position: EntityPosition, host: Pick<TrackHost, 'block'>): EntityPosition | undefined => {
    const rail = railPositionOf(position, host);
    const shape = railShapeOf(host.block(rail));
    if (shape === undefined) return undefined;
    const [a, b] = EXITS[shape];
    const ax = rail.x + 0.5 + a.x * 0.5;
    const ay = rail.y + RAIL_HEIGHT + a.y * 0.5;
    const az = rail.z + 0.5 + a.z * 0.5;
    const ex = rail.x + 0.5 + b.x * 0.5 - ax;
    const ey = (rail.y + RAIL_HEIGHT + b.y * 0.5 - ay) * 2;
    const ez = rail.z + 0.5 + b.z * 0.5 - az;
    const along =
        ex === 0
            ? position.z - rail.z
            : ez === 0
              ? position.x - rail.x
              : ((position.x - ax) * ex + (position.z - az) * ez) * 2;
    const y = ay + ey * along;
    return { x: ax + ex * along, y: ey < 0 ? y + 1 : ey > 0 ? y + 0.5 : y, z: az + ez * along };
};

const horizontal = (velocity: EntityPosition): number => Math.hypot(velocity.x, velocity.z);
const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));

/** `OldMinecartBehavior.getMaxSpeed`. */
const maxSpeedOf = (cart: TrackCart): number => (cart.inWater ? WATER_MAX_SPEED : MAX_SPEED);

/**
 * `OldMinecartBehavior.moveAlongTrack`: one tick of a cart on the rail at `rail`. The step
 * rewrites the cart's position and velocity.
 *
 * A player rider's input, which Java adds to a cart nearly at rest, is the client's to send and
 * does not reach this step.
 */
export const moveAlongTrack = (cart: TrackCart, rail: EntityPosition, block: TrackBlock, host: TrackHost): void => {
    const shape = railShapeOf(block);
    if (shape === undefined) return;
    const start = cart.position;
    const before = railPoint(start, host);
    let y = rail.y;
    const poweredRail = block.identifier === POWERED_RAIL;
    const powered = poweredRail && isPoweredRail(block);
    const braking = poweredRail && !powered;
    const pull = SLOPE_PULL * (cart.inWater ? WATER_SLOPE_SHARE : 1);
    let velocity = cart.velocity;
    switch (shape) {
        case 'ascending_east':
            velocity = { ...velocity, x: velocity.x - pull };
            y += 1;
            break;
        case 'ascending_west':
            velocity = { ...velocity, x: velocity.x + pull };
            y += 1;
            break;
        case 'ascending_north':
            velocity = { ...velocity, z: velocity.z + pull };
            y += 1;
            break;
        case 'ascending_south':
            velocity = { ...velocity, z: velocity.z - pull };
            y += 1;
            break;
        default:
            break;
    }

    // Turn the cart's speed onto the rail, along whichever end it already heads toward.
    const [a, b] = EXITS[shape];
    let ex = b.x - a.x;
    let ez = b.z - a.z;
    const length = Math.hypot(ex, ez);
    if (velocity.x * ex + velocity.z * ez < 0) {
        ex = -ex;
        ez = -ez;
    }
    const speed = Math.min(TRACK_SPEED_LIMIT, horizontal(velocity));
    velocity = { x: (speed * ex) / length, y: velocity.y, z: (speed * ez) / length };
    if (braking)
        velocity =
            horizontal(velocity) < BRAKE_STOP_SPEED
                ? { x: 0, y: 0, z: 0 }
                : { x: velocity.x * BRAKE_SHARE, y: 0, z: velocity.z * BRAKE_SHARE };

    // Set the cart on the rail's line, then move it along.
    const ax = rail.x + 0.5 + a.x * 0.5;
    const az = rail.z + 0.5 + a.z * 0.5;
    const lineX = rail.x + 0.5 + b.x * 0.5 - ax;
    const lineZ = rail.z + 0.5 + b.z * 0.5 - az;
    const along =
        lineX === 0
            ? start.z - rail.z
            : lineZ === 0
              ? start.x - rail.x
              : ((start.x - ax) * lineX + (start.z - az) * lineZ) * 2;
    const onLine = { x: ax + lineX * along, y, z: az + lineZ * along };
    const share = cart.ridden ? RIDDEN_MOVE_SHARE : 1;
    const limit = maxSpeedOf(cart);
    const step = { x: clamp(share * velocity.x, limit), y: 0, z: clamp(share * velocity.z, limit) };
    let position = host.move(onLine, step);
    // `Entity.move` stops the velocity along an axis a block stopped the move on.
    velocity = {
        x: Math.abs(position.x - (onLine.x + step.x)) > 1e-7 ? 0 : velocity.x,
        y: velocity.y,
        z: Math.abs(position.z - (onLine.z + step.z)) > 1e-7 ? 0 : velocity.z
    };
    const end = floorOf(position);
    if (a.y !== 0 && end.x - rail.x === a.x && end.z - rail.z === a.z) position = { ...position, y: position.y + a.y };
    else if (b.y !== 0 && end.x - rail.x === b.x && end.z - rail.z === b.z)
        position = { ...position, y: position.y + b.y };

    // `AbstractMinecart.applyNaturalSlowdown`, which also drops the vertical speed.
    const drag = cart.slowdown * (cart.inWater ? WATER_SLOWDOWN : 1);
    velocity = { x: velocity.x * drag, y: 0, z: velocity.z * drag };

    // What the cart lost or gained in height along the rail speeds it up or slows it down.
    const after = railPoint(position, host);
    if (after !== undefined && before !== undefined) {
        const gain = (before.y - after.y) * HEIGHT_TO_SPEED;
        const moving = horizontal(velocity);
        if (moving > 0) {
            const scale = (moving + gain) / moving;
            velocity = { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale };
        }
        position = { ...position, y: after.y };
    }

    // A cart that left its rail's block heads straight out of it.
    const left = floorOf(position);
    if (left.x !== rail.x || left.z !== rail.z) {
        const moving = horizontal(velocity);
        velocity = { x: moving * (left.x - rail.x), y: velocity.y, z: moving * (left.z - rail.z) };
    }

    if (powered) {
        const moving = horizontal(velocity);
        if (moving > POWERED_MOVING_SPEED)
            velocity = {
                x: velocity.x + (velocity.x / moving) * POWERED_BOOST,
                y: velocity.y,
                z: velocity.z + (velocity.z / moving) * POWERED_BOOST
            };
        else if (shape === 'east_west') {
            const x = host.isRedstoneConductor({ ...rail, x: rail.x - 1 })
                ? POWERED_START
                : host.isRedstoneConductor({ ...rail, x: rail.x + 1 })
                  ? -POWERED_START
                  : velocity.x;
            velocity = { ...velocity, x };
        } else if (shape === 'north_south') {
            const z = host.isRedstoneConductor({ ...rail, z: rail.z - 1 })
                ? POWERED_START
                : host.isRedstoneConductor({ ...rail, z: rail.z + 1 })
                  ? -POWERED_START
                  : velocity.z;
            velocity = { ...velocity, z };
        }
    }

    cart.position = position;
    cart.velocity = velocity;
};

/**
 * The share of its speed a cart keeps each tick before water's drag: `getSlowdownFactor` for a
 * cart with no container, and for a chest or hopper cart
 * `AbstractMinecartContainer.applyNaturalSlowdown`, which slows it less the fuller it is.
 * @param containerSignal - The comparator signal the cart's container gives, or undefined for a
 *   cart with no container.
 */
export const cartSlowdown = (ridden: boolean, containerSignal: number | undefined): number =>
    containerSignal === undefined
        ? ridden
            ? RIDDEN_SLOWDOWN
            : EMPTY_SLOWDOWN
        : CONTAINER_SLOWDOWN + (MAX_SIGNAL - containerSignal) * CONTAINER_SLOWDOWN_PER_SIGNAL;
