import { beforeEach, describe, expect, it } from 'vitest';

import { Vector3 } from '@jsprismarine/math';
import { testEntityServer } from '../testing/entityServer';
import { Position } from '../world/Position';
import { drawPower, lookVector } from './Archery';
import { DamageCause } from './DamageCause';
import type { Entity } from './Entity';
import Arrow from './other/Arrow';
import type { Projectile } from './other/Projectile';
import Snowball from './other/Snowball';
import { Attribute, AttributeIds } from './Attribute';
import { GenericEntity } from './GenericEntity';

/** What every mob in this file has, which is what the damage expectations count down from. */
const MOB_HEALTH = 10;

/** A body that remembers the shove it was given instead of spending it. */
class Shoved extends GenericEntity {
    public shove: { x: number; z: number; strength: number } | undefined;

    public override applyKnockback(directionX: number, directionZ: number, strength: number): void {
        this.shove = { x: directionX, z: directionZ, strength };
    }
}

/**
 * Things in flight.
 *
 * The part worth testing is the sweep: an arrow crossing three blocks a tick would step straight
 * over anything standing between where it was and where it ended up, so a check at the destination
 * alone finds nothing at all.
 */
const scene = ({ solidAt = null }: { solidAt?: ((x: number, y: number, z: number) => boolean) | null } = {}) => {
    const nearby: Entity[] = [];
    const removed: string[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => testEntityServer(),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        sendActorMetadata: async () => {},
        broadcastMove: async () => {},
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        getEntityGrid: () => ({ near: () => nearby }),
        removeEntity: async (entity: Entity) => void removed.push(entity.getType()),
        getLoadedChunk: () => null
    };

    /** Builds one of this file's projectiles at a place in `world`. */
    const spawn = <T extends Entity>(
        Species: new (options: { position: Position; velocity?: Vector3; owner?: Entity | null }) => T,
        { at, ...rest }: { at: readonly [x: number, y: number, z: number]; velocity?: Vector3; owner?: Entity | null }
    ): T => {
        const entity = new Species({ ...rest, position: new Position(...at, world) });
        nearby.push(entity);
        return entity;
    };

    /**
     * A target for the arrow, with the health the expectations count down from.
     *
     * `GenericEntity` is what the data-driven runtime gives every mob, so it is what a shot
     * actually meets. The shove is recorded rather than applied, because the base entity has
     * no velocity to spend.
     */
    const target = (x: number): Shoved => {
        const body = new Shoved({ identifier: 'minecraft:cow', position: new Position(x, 64, 0, world) });
        body.attributes.setAttribute(
            new Attribute({ name: AttributeIds.Health, min: 0, max: MOB_HEALTH, def: MOB_HEALTH })
        );
        nearby.push(body);
        return body;
    };

    /** Arrows read the world through their own view, so it is described there. */
    const describeBlocks = (projectile: Projectile) => {
        const view = projectile['view'];
        view.isSolid = (x: number, y: number, z: number) => (solidAt ? solidAt(x, y, z) : false);
        view.isLoaded = () => true;
    };

    return { world, spawn, target, describeBlocks, removed, nearby };
};

/** An arrow launched east from the origin. */
const arrowEast = (stage: ReturnType<typeof scene>, speed: number) => {
    const arrow = stage.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(speed, 0, 0) });
    stage.describeBlocks(arrow);
    return arrow;
};

describe('projectiles', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    describe('the sweep', () => {
        it('hits something standing between where it was and where it would end up', async () => {
            // Three blocks in one tick, past a cow at one block. A check at the destination alone
            // would find nothing but open air.
            const cow = stage.target(1);
            const arrow = arrowEast(stage, 3);

            await arrow.update(0);

            expect(cow.getHealth()).toBeLessThan(MOB_HEALTH);
        });

        it('reports itself as a projectile, and names the shooter', async () => {
            const shooter = stage.target(-5);
            const cow = stage.target(1);

            const arrow = stage.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(3, 0, 0), owner: shooter });
            stage.describeBlocks(arrow);

            await arrow.update(0);

            expect(cow.getLastDamageSource()?.cause).toBe(DamageCause.Projectile);
            expect(cow.getLastDamageSource()?.attacker).toBe(shooter);
        });

        it('does not hit the shooter on the tick it was loosed', async () => {
            // An arrow starts inside the bow that fired it, so without the grace period nothing
            // would ever leave the string.
            const shooter = stage.target(0);
            const arrow = stage.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(3, 0, 0), owner: shooter });
            stage.describeBlocks(arrow);

            await arrow.update(0);

            expect(shooter.getHealth()).toBe(MOB_HEALTH);
        });

        it('flies on through anything it could not hurt', async () => {
            const cow = stage.target(1);
            await cow.damage(100);

            const arrow = arrowEast(stage, 3);
            await arrow.update(0);

            // Past the corpse rather than stopping dead against it.
            expect(arrow.getPosition().getX()).toBeCloseTo(3);
        });
    });

    describe('flight', () => {
        it('drops as it goes', async () => {
            const arrow = arrowEast(stage, 2);

            await arrow.update(0);
            await arrow.update(1);

            expect(arrow.getVelocity().getY()).toBeLessThan(0);
        });

        it('sticks where it strikes a block, and stays there', async () => {
            const walled = scene({ solidAt: (x) => x >= 2 });
            const arrow = walled.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(3, 0, 0) });
            walled.describeBlocks(arrow);

            await arrow.update(0);
            const landed = arrow.getPosition().getX();

            await arrow.update(1);

            expect(landed).toBeLessThan(3);
            expect(arrow.getPosition().getX()).toBe(landed);
        });

        it('hits harder the faster it is going', async () => {
            const hurtBy = async (speed: number) => {
                const round = scene();
                const cow = round.target(1);
                const arrow = round.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(speed, 0, 0) });
                round.describeBlocks(arrow);

                await arrow.update(0);
                return MOB_HEALTH - cow.getHealth();
            };

            expect(await hurtBy(3)).toBeGreaterThan(await hurtBy(1));
        });
    });

    describe('the harmless ones', () => {
        it('shove without hurting', async () => {
            const cow = stage.target(1);
            const snowball = stage.spawn(Snowball, { at: [0, 64, 0], velocity: new Vector3(2, 0, 0) });
            stage.describeBlocks(snowball);

            await snowball.update(0);

            expect(cow.getHealth()).toBe(MOB_HEALTH);
            expect(cow.shove?.x).toBeGreaterThan(0);
        });
    });

    describe('drawing a bow', () => {
        it('is worth nothing at all when barely pulled', () => {
            expect(drawPower(1)).toBeLessThan(0.2);
        });

        it('reaches full power after a second', () => {
            expect(drawPower(20)).toBe(1);
        });

        it('never goes past full, however long it is held', () => {
            expect(drawPower(200)).toBe(1);
        });

        it('is worth far more at the end of the draw than at the start', () => {
            // Vanilla's curve rather than a straight fraction of the time: the last few ticks are
            // what make a full draw worth waiting for.
            const firstHalf = drawPower(10) - drawPower(0);
            const secondHalf = drawPower(20) - drawPower(10);

            expect(secondHalf).toBeGreaterThan(firstHalf);
        });

        it('aims where the shooter is looking, using Minecraft’s own angles', () => {
            // Yaw runs clockwise from south, so due south is +z and due west is -x. Getting the
            // sign wrong sends every arrow off at ninety degrees to where the player aimed.
            const south = lookVector(0, 0);
            expect(south.getZ()).toBeCloseTo(1);
            expect(south.getX()).toBeCloseTo(0);

            const west = lookVector(90, 0);
            expect(west.getX()).toBeCloseTo(-1);

            const down = lookVector(0, 90);
            expect(down.getY()).toBeCloseTo(-1);
        });
    });
});
