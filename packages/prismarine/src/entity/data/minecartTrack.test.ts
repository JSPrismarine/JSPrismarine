import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import type { TrackBlock, TrackCart, TrackHost } from './minecartTrack';
import {
    EMPTY_SLOWDOWN,
    RIDDEN_SLOWDOWN,
    cartSlowdown,
    moveAlongTrack,
    railPoint,
    railPositionOf
} from './minecartTrack';

const key = ({ x, y, z }: EntityPosition): string => `${x},${y},${z}`;

/** A world of rails and solid blocks, and a cart moved through it one tick at a time. */
const track = (rails: ReadonlyMap<string, TrackBlock>, solid: ReadonlySet<string> = new Set()) => {
    const host: TrackHost = {
        block: (at) => rails.get(key(at)),
        isRedstoneConductor: (at) => solid.has(key(at)),
        move: (from, by) => {
            const to = { x: from.x + by.x, y: from.y + by.y, z: from.z + by.z };
            return solid.has(key({ x: Math.floor(to.x), y: Math.floor(to.y), z: Math.floor(to.z) })) ? from : to;
        }
    };
    const tick = (cart: TrackCart): void => {
        const rail = railPositionOf(cart.position, host);
        const block = host.block(rail);
        if (block !== undefined) moveAlongTrack(cart, rail, block, host);
    };
    return { host, tick };
};

const rail = (direction: number, identifier = 'minecraft:rail', powered?: boolean): TrackBlock => ({
    identifier,
    states: { rail_direction: direction, ...(powered === undefined ? {} : { rail_data_bit: powered }) }
});

/** A run of one rail block along x, from x = 0 to `length` - 1, at y 0. */
const eastWest = (length: number, block: TrackBlock = rail(1)): Map<string, TrackBlock> =>
    new Map(Array.from({ length }, (_, x) => [key({ x, y: 0, z: 0 }), block] as const));

const cartAt = (x: number, velocityX: number, ridden = false): TrackCart => ({
    position: { x, y: 0.0625, z: 0.5 },
    velocity: { x: velocityX, y: 0, z: 0 },
    ridden,
    inWater: false,
    slowdown: cartSlowdown(ridden, undefined)
});

describe('a minecart on a rail', () => {
    it("keeps Java's 0.96 of its speed a tick, 0.997 with a rider, and stays on the rail", () => {
        const { tick } = track(eastWest(40));
        const empty = cartAt(1.5, 0.2);
        const ridden = cartAt(1.5, 0.2, true);
        tick(empty);
        tick(ridden);

        expect(empty.velocity.x).toBeCloseTo(0.2 * EMPTY_SLOWDOWN, 12);
        expect(ridden.velocity.x).toBeCloseTo(0.2 * RIDDEN_SLOWDOWN, 12);
        // A ridden cart moves three quarters of its speed a tick.
        expect(empty.position.x).toBeCloseTo(1.7, 12);
        expect(ridden.position.x).toBeCloseTo(1.65, 12);
        expect(empty.position).toMatchObject({ y: 0.0625, z: 0.5 });
    });

    it('turns its speed onto the rail and is set on its line', () => {
        const { tick } = track(eastWest(40));
        const cart = {
            ...cartAt(1.5, 0.3),
            position: { x: 1.5, y: 0.0625, z: 0.8 },
            velocity: { x: 0.3, y: 0, z: 0.4 }
        };
        tick(cart);

        expect(cart.position.z).toBe(0.5);
        expect(cart.velocity.z).toBe(0);
        expect(cart.velocity.x).toBeCloseTo(0.5 * EMPTY_SLOWDOWN, 12);
    });

    it('moves at most 0.4 a tick', () => {
        const { tick } = track(eastWest(40));
        const cart = cartAt(1.5, 1.5);
        tick(cart);

        expect(cart.position.x).toBeCloseTo(1.9, 12);
    });

    it('speeds up by 0.06 a tick on a powered rail and brakes on an unpowered one', () => {
        const powered = cartAt(1.5, 0.1);
        track(eastWest(40, rail(1, 'minecraft:golden_rail', true))).tick(powered);
        const braked = cartAt(1.5, 0.2);
        track(eastWest(40, rail(1, 'minecraft:golden_rail', false))).tick(braked);
        const stopped = cartAt(1.5, 0.02);
        track(eastWest(40, rail(1, 'minecraft:golden_rail', false))).tick(stopped);

        expect(powered.velocity.x).toBeCloseTo(0.1 * EMPTY_SLOWDOWN + 0.06, 12);
        expect(braked.velocity.x).toBeCloseTo(0.1 * EMPTY_SLOWDOWN, 12);
        expect(stopped.velocity.x).toBe(0);
    });

    it('starts a cart at rest on a powered rail away from a block at its end', () => {
        const rails = eastWest(3, rail(1, 'minecraft:golden_rail', true));
        const { tick } = track(rails, new Set([key({ x: -1, y: 0, z: 0 })]));
        const cart = cartAt(0.5, 0);
        tick(cart);

        expect(cart.velocity.x).toBe(0.02);
    });

    it('rolls down a slope and turns its drop into speed', () => {
        // An ascending-east rail at x 1, rising from the rail at x 0 to the one at x 2, y 1.
        const rails = new Map([
            [key({ x: 0, y: 0, z: 0 }), rail(1)],
            [key({ x: 1, y: 0, z: 0 }), rail(2)],
            [key({ x: 2, y: 1, z: 0 }), rail(1)]
        ]);
        const { tick } = track(rails);
        const cart = { ...cartAt(1.5, 0), position: { x: 1.5, y: 0.5625, z: 0.5 } };
        for (let step = 0; step < 4; step += 1) tick(cart);

        expect(cart.velocity.x).toBeLessThan(0);
        expect(cart.position.x).toBeLessThan(1.5);
        expect(cart.position.y).toBeLessThan(0.5625);
    });

    it('follows a curve from heading east to heading south', () => {
        const rails = new Map([
            [key({ x: 0, y: 0, z: 0 }), rail(1)],
            // South-west: open to the west, where the cart comes from, and the south.
            [key({ x: 1, y: 0, z: 0 }), rail(7)],
            [key({ x: 1, y: 0, z: 1 }), rail(0)],
            [key({ x: 1, y: 0, z: 2 }), rail(0)]
        ]);
        const { tick } = track(rails);
        const cart = cartAt(0.5, 0.3);
        for (let step = 0; step < 8; step += 1) tick(cart);

        expect(cart.position.x).toBeCloseTo(1.5, 9);
        expect(cart.position.z).toBeGreaterThan(1.5);
        expect(cart.velocity.z).toBeGreaterThan(0);
    });

    it('reads the point on the rail under a cart, and none off a rail', () => {
        const host = track(eastWest(2)).host;

        expect(railPoint({ x: 0.3, y: 1.2, z: 0.9 }, host)).toEqual({ x: 0.3, y: 0.0625, z: 0.5 });
        expect(railPoint({ x: 5.5, y: 0, z: 0.5 }, host)).toBeUndefined();
    });

    it("slows a container cart by Java's 0.98 plus 0.001 for each signal level short of full", () => {
        expect(cartSlowdown(false, 0)).toBeCloseTo(0.995, 12);
        expect(cartSlowdown(false, 15)).toBeCloseTo(0.98, 12);
    });
});
