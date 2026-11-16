import { describe, expect, it } from 'vitest';

import type { EntityPosition } from '@jsprismarine/entities';

import type { ProjectileFlight } from './projectileFlight';
import { projectileFlight, velocityAfterMove, velocityBeforeMove } from './projectileFlight';
import type { ExtraEntities } from './testing';
import { entityFixture, TestEntityWorld } from './testing';

/** One tick of a flight: the velocity the projectile moves by, and the one it keeps. */
const tickOf = (flight: ProjectileFlight, velocity: EntityPosition, inWater = false) => {
    const moved = velocityBeforeMove(flight, velocity, inWater);
    return { moved, kept: velocityAfterMove(flight, moved, inWater) };
};

const AT_REST = { x: 0, y: 0, z: 0 };
const FORWARD = { x: 1, y: 0, z: 0 };

/** A Bedrock component whose numbers differ from every Java class's, so a Java flight cannot match it by chance. */
const BEDROCK_COMPONENT = { gravity: 0.2, inertia: 0.5, liquid_inertia: 0.25 };

describe('projectileFlight', () => {
    it.each([
        // `AbstractArrow.getDefaultGravity`.
        ['minecraft:thrown_trident', 0.05],
        ['minecraft:arrow', 0.05],
        // `ThrowableProjectile.getDefaultGravity`.
        ['minecraft:ender_pearl', 0.03],
        ['minecraft:snowball', 0.03],
        ['minecraft:egg', 0.03],
        // `ThrownExperienceBottle.getDefaultGravity` and `AbstractThrownPotion.getDefaultGravity`.
        ['minecraft:xp_bottle', 0.07],
        ['minecraft:splash_potion', 0.05],
        ['minecraft:lingering_potion', 0.05],
        // `ShulkerBullet.getDefaultGravity` and `LlamaSpit.getDefaultGravity`.
        ['minecraft:shulker_bullet', 0.04],
        ['minecraft:llama_spit', 0.06]
    ])("gives %s Java's gravity of %d over its component's", (identifier, gravity) => {
        expect(projectileFlight(identifier, BEDROCK_COMPONENT).gravity).toBe(gravity);
    });

    it('reads a type Java has no class for from its component', () => {
        expect(projectileFlight('example:dart', BEDROCK_COMPONENT)).toEqual({
            order: 'component',
            gravity: 0.2,
            airDrag: 0.5,
            waterDrag: 0.25
        });
        expect(projectileFlight('example:dart', {})).toEqual({
            order: 'component',
            gravity: 0.03,
            airDrag: 0.99,
            waterDrag: 0.6
        });
    });
});

describe('an arrow or a trident', () => {
    const trident = projectileFlight('minecraft:thrown_trident', {});
    const arrow = projectileFlight('minecraft:arrow', {});

    it('moves by its velocity, then keeps 0.99 of it and loses 0.05 off the top', () => {
        const { moved, kept } = tickOf(trident, { x: 1, y: 0.5, z: 0 });
        expect(moved).toEqual({ x: 1, y: 0.5, z: 0 });
        expect(kept.x).toBeCloseTo(0.99, 6);
        expect(kept.y).toBeCloseTo(0.5 * 0.99 - 0.05, 6);
    });

    it("keeps its class's water inertia before the move in water: 0.6 for an arrow, 0.99 for a trident", () => {
        expect(tickOf(arrow, FORWARD, true).moved.x).toBeCloseTo(0.6, 6);
        expect(tickOf(trident, FORWARD, true).moved.x).toBeCloseTo(0.99, 6);
        // No second drag after the move in water, only gravity.
        expect(tickOf(trident, FORWARD, true).kept).toEqual({ ...tickOf(trident, FORWARD, true).moved, y: -0.05 });
    });
});

describe('a thrown item', () => {
    const pearl = projectileFlight('minecraft:ender_pearl', {});

    it('takes gravity and then 0.99 drag before it moves', () => {
        const { moved, kept } = tickOf(pearl, AT_REST);
        expect(moved.y).toBeCloseTo(-0.03 * 0.99, 6);
        expect(kept).toEqual(moved);
    });

    it('keeps 0.8 of its speed per tick in water', () => {
        expect(tickOf(pearl, FORWARD, true).moved.x).toBeCloseTo(0.8, 6);
    });

    it('falls by the experience bottle its own gravity', () => {
        expect(tickOf(projectileFlight('minecraft:xp_bottle', {}), AT_REST).moved.y).toBeCloseTo(-0.07 * 0.99, 6);
    });
});

describe('a shulker bullet', () => {
    it('falls by 0.04 before it moves and keeps all of its speed', () => {
        const { moved, kept } = tickOf(projectileFlight('minecraft:shulker_bullet', {}), FORWARD, true);
        expect(moved).toEqual({ x: 1, y: -0.04, z: 0 });
        expect(kept).toEqual(moved);
    });
});

describe('llama spit', () => {
    it('moves by its velocity, then keeps 0.99 of it and loses 0.06', () => {
        const { moved, kept } = tickOf(projectileFlight('minecraft:llama_spit', {}), FORWARD);
        expect(moved).toEqual(FORWARD);
        expect(kept.x).toBeCloseTo(0.99, 6);
        expect(kept.y).toBeCloseTo(-0.06, 6);
    });
});

describe('a component flight', () => {
    it('moves, then takes gravity and its inertia, as the Bedrock component describes', () => {
        const { moved, kept } = tickOf(projectileFlight('example:dart', BEDROCK_COMPONENT), FORWARD);
        expect(moved).toEqual(FORWARD);
        expect(kept).toEqual({ x: 0.5, y: -0.1, z: 0 });
    });
});

/** Vanilla projectile types whose Bedrock components fall by numbers Java does not use. */
const PROJECTILES: ExtraEntities = Object.fromEntries(
    ['minecraft:thrown_trident', 'minecraft:ender_pearl', 'example:dart'].map((identifier) => [
        identifier,
        {
            components: {
                'minecraft:collision_box': { width: 0.25, height: 0.25 },
                'minecraft:physics': {},
                'minecraft:projectile': BEDROCK_COMPONENT
            }
        }
    ])
);

describe('the entity runtime', () => {
    it.each([
        ['minecraft:thrown_trident', -0.05],
        ['minecraft:ender_pearl', -0.03 * 0.99],
        ['example:dart', -0.1]
    ])('flies a launched %s by its flight, ending its first tick at a vertical speed of %d', (identifier, speed) => {
        const { runtime } = entityFixture(new TestEntityWorld(), undefined, PROJECTILES);
        const projectile = runtime.launchProjectile(identifier, { x: 0.5, y: 100, z: 0.5 }, FORWARD, 1, 0, 0);
        if (projectile === undefined) throw new Error(`the runtime refused to launch ${identifier}`);
        const start = projectile.position;

        runtime.tick(1);

        expect(projectile.body.velocity.y).toBeCloseTo(speed, 6);
        // A thrown item moves by the velocity its gravity and drag already changed.
        const moved = identifier === 'minecraft:ender_pearl' ? speed : 0;
        expect(projectile.position.y - start.y).toBeCloseTo(moved, 6);
    });
});
