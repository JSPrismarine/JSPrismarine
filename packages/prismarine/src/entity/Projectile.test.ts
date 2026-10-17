import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { Position } from '../world/Position';
import { drawPower, lookVector } from './Archery';
import { DamageCause } from './DamageCause';
import type { Entity } from './Entity';
import Arrow from './other/Arrow';
import Snowball from './other/Snowball';
import Cow from './passive/Cow';

/**
 * Things in flight.
 *
 * The part worth testing is the sweep: an arrow crossing three blocks a tick would step straight
 * over anything standing between where it was and where it ended up, so a check at the destination
 * alone finds nothing at all.
 */
const scene = ({ solidAt = null as ((x: number, y: number, z: number) => boolean) | null } = {}) => {
    const nearby: Entity[] = [];
    const removed: string[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        }),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        sendActorMetadata: async () => {},
        broadcastMove: async () => {},
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        getEntityGrid: () => ({ near: () => nearby }),
        removeEntity: async (entity: Entity) => void removed.push(entity.getType()),
        getLoadedChunk: () => null
    };

    const spawn = <T extends Entity>(Species: new (options: any) => T, options: any): T => {
        const entity = new Species({ ...options, position: new Position(...options.at, world) });
        nearby.push(entity);
        return entity;
    };

    /** Arrows read the world through their own view, so it is described there. */
    const describeBlocks = (projectile: Entity) => {
        const view: any = (projectile as any).view;
        view.isSolid = (x: number, y: number, z: number) => (solidAt ? solidAt(x, y, z) : false);
        view.isLoaded = () => true;
    };

    return { world, spawn, describeBlocks, removed, nearby };
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
            const cow = stage.spawn(Cow, { at: [1, 64, 0] });
            const arrow = arrowEast(stage, 3);

            await arrow.update(0);

            expect(cow.getHealth()).toBeLessThan(10);
        });

        it('reports itself as a projectile, and names the shooter', async () => {
            const shooter = stage.spawn(Cow, { at: [-5, 64, 0] });
            const cow = stage.spawn(Cow, { at: [1, 64, 0] });

            const arrow = stage.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(3, 0, 0), owner: shooter });
            stage.describeBlocks(arrow);

            await arrow.update(0);

            expect(cow.getLastDamageSource()?.cause).toBe(DamageCause.Projectile);
            expect(cow.getLastDamageSource()?.attacker).toBe(shooter);
        });

        it('does not hit the shooter on the tick it was loosed', async () => {
            // An arrow starts inside the bow that fired it, so without the grace period nothing
            // would ever leave the string.
            const shooter = stage.spawn(Cow, { at: [0, 64, 0] });
            const arrow = stage.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(3, 0, 0), owner: shooter });
            stage.describeBlocks(arrow);

            await arrow.update(0);

            expect(shooter.getHealth()).toBe(10);
        });

        it('flies on through anything it could not hurt', async () => {
            const cow = stage.spawn(Cow, { at: [1, 64, 0] });
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
                const cow = round.spawn(Cow, { at: [1, 64, 0] });
                const arrow = round.spawn(Arrow, { at: [0, 64, 0], velocity: new Vector3(speed, 0, 0) });
                round.describeBlocks(arrow);

                await arrow.update(0);
                return 10 - cow.getHealth();
            };

            expect(await hurtBy(3)).toBeGreaterThan(await hurtBy(1));
        });
    });

    describe('the harmless ones', () => {
        it('shove without hurting', async () => {
            const cow = stage.spawn(Cow, { at: [1, 64, 0] });
            const snowball = stage.spawn(Snowball, { at: [0, 64, 0], velocity: new Vector3(2, 0, 0) });
            stage.describeBlocks(snowball);

            await snowball.update(0);

            expect(cow.getHealth()).toBe(10);
            expect((cow as any).pendingKnockback?.impulse.getX()).toBeGreaterThan(0);
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
