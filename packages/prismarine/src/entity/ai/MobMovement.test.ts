import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Vector3 } from '@jsprismarine/math';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { BlockStateValue } from '../../block/state/BlockState';
import Chunk from '../../world/chunk/Chunk';
import EntityGrid from '../../world/EntityGrid';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { JUMP_POWER, Mob } from '../Mob';
import BlockView from './BlockView';
import GoalSelector from './GoalSelector';
import { PathFollower, findPath } from './Navigator';
import { WALK_SPEED } from './Speed';

/**
 * A world made of whatever the test builds, with no server behind it.
 *
 * Only the handful of things a mob actually asks a world for: which chunks are in memory, who is
 * playing, and somewhere to send a movement to. Building a real one would mean a provider, a
 * generator and a socket, none of which have any bearing on whether a mob walks smoothly.
 */
class TestWorld {
    private readonly chunks = new Map<string, Chunk>();

    /** How many movement broadcasts the mob asked for, so throttling can be checked. */
    public broadcasts = 0;

    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        return this.chunks.get(`${cx},${cz}`) ?? null;
    }

    public getPlayers(): [] {
        return [];
    }

    /** Whatever the test put in it; a mob asks this every tick to find out who it is touching. */
    public readonly entityGrid = new EntityGrid();

    public getEntityGrid(): EntityGrid {
        return this.entityGrid;
    }

    public async broadcastMove(): Promise<void> {
        this.broadcasts++;
    }

    public getServer(): any {
        return {};
    }

    public getName(): string {
        return 'test';
    }

    public chunkAt(cx: number, cz: number): Chunk {
        const key = `${cx},${cz}`;
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new Chunk(cx, cz);
            this.chunks.set(key, chunk);
        }

        return chunk;
    }

    /** Grass from `-64` up to `groundY`, air above, over a square of chunks. */
    public flatGround(radius: number, groundY: number): this {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

        for (let cx = -radius; cx <= radius; cx++) {
            for (let cz = -radius; cz <= radius; cz++) {
                const chunk = this.chunkAt(cx, cz);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        chunk.fillColumn(x, z, -64, groundY - 1, stone);
                        chunk.fillColumn(x, z, groundY, groundY, grass);
                    }
                }
            }
        }

        return this;
    }

    /** A solid wall, in world coordinates, inclusive at both ends. */
    public wall(minX: number, minZ: number, maxX: number, maxZ: number, fromY: number, toY: number): this {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const chunk = this.getLoadedChunk(x >> 4, z >> 4);
                chunk?.fillColumn(x & 0xf, z & 0xf, fromY, toY, stone);
            }
        }

        return this;
    }

    /** One named block, in world coordinates, for the shapes a wall of stone cannot express. */
    public place(x: number, y: number, z: number, name: string, states?: Record<string, BlockStateValue>): this {
        const runtimeId = states ? BlockRuntimeIds.tryGetByState(name, states) : BlockRuntimeIds.tryGetByName(name);
        if (runtimeId === null) throw new Error(`the catalogue has no ${name}`);

        this.getLoadedChunk(x >> 4, z >> 4)?.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
        return this;
    }

    /** A run of one named block along z, which is how every barrier in these tests is built. */
    public barrier(x: number, minZ: number, maxZ: number, y: number, name: string): this {
        for (let z = minZ; z <= maxZ; z++) this.place(x, y, z, name);
        return this;
    }

    public asWorld(): World {
        return this as unknown as World;
    }
}

/** The surface of a flat test world: the grass is at 64, so feet rest at 65. */
const GROUND = 64;
const FEET = GROUND + 1;

const positionIn = (world: TestWorld, x: number, y: number, z: number) => new Position(x, y, z, world.asWorld());

/**
 * A mob with nothing it wants to do.
 *
 * An ordinary mob wanders by default, which is right for a mob and wrong for a test of how it
 * moves: it would set off somewhere of its own choosing halfway through a measurement. With no
 * goals, the only thing moving it is whatever the test asked for.
 */
class InertMob extends Mob {
    // A sheep, and not an abstraction: 0.9 across and 1.3 tall, which is a body wide enough that
    // the difference between colliding it and colliding its centre point is visible. It is also
    // the animal the whole thing was reported against.
    public static override MOB_ID = 'minecraft:sheep';

    protected override createGoals(): GoalSelector {
        return new GoalSelector();
    }
}

/** The same, but it can be told to jump, so the arc it flies can be measured directly. */
class JumpingMob extends InertMob {
    public launch(power: number): void {
        this.velocity = this.velocity.withY(power);
        this.onGround = false;
    }
}

describe('mob navigation', () => {
    let world: TestWorld;
    let view: BlockView;

    beforeEach(() => {
        world = new TestWorld().flatGround(3, GROUND);
        view = new BlockView(world.asWorld());
    });

    it('crosses open ground in a straight line rather than a staircase', () => {
        // The search works on a grid, so a diagonal route comes out of it as an alternating
        // zig-zag of cardinal and diagonal steps. Following that literally is exactly the
        // jerkiness this whole thing exists to avoid, so the route is straightened afterwards -
        // and a straight run across open ground should end up as barely any waypoints at all.
        const path = findPath(view, new Vector3(2.5, FEET, 2.5), new Vector3(22.5, FEET, 18.5));

        expect(path).not.toBeNull();
        expect(path!.length).toBeLessThanOrEqual(3);

        // And it must still end where it was asked to go.
        const last = path![path!.length - 1]!;
        expect(Math.abs(last.getX() - 22.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(last.getZ() - 18.5)).toBeLessThanOrEqual(1);
    });

    it('goes around a wall', () => {
        // A wall with a gap at one end: the only way through is round it.
        world.wall(8, -10, 8, 6, FEET, FEET + 2);

        const path = findPath(view, new Vector3(2.5, FEET, 0.5), new Vector3(14.5, FEET, 0.5));
        expect(path).not.toBeNull();

        // Every waypoint has to be somewhere a mob could actually stand.
        for (const point of path!) {
            expect(view.canStandAt(Math.floor(point.getX()), Math.floor(point.getY()), Math.floor(point.getZ()))).toBe(
                true
            );
        }

        // Round the end of the wall, so it must pass beyond where the wall stops.
        expect(path!.some((point) => point.getZ() > 6)).toBe(true);
    });

    it('refuses a destination it is walled away from', () => {
        // Sealed in: four walls and a lid.
        world.wall(-2, -2, 4, -2, FEET, FEET + 3);
        world.wall(-2, 4, 4, 4, FEET, FEET + 3);
        world.wall(-2, -2, -2, 4, FEET, FEET + 3);
        world.wall(4, -2, 4, 4, FEET, FEET + 3);

        expect(findPath(view, new Vector3(1.5, FEET, 1.5), new Vector3(30.5, FEET, 30.5))).toBeNull();
    });

    it('steps up a single block but not a wall', () => {
        world.wall(6, -8, 6, 8, FEET, FEET); // one block high: a step
        world.wall(12, -8, 12, 8, FEET, FEET + 3); // four blocks high: a wall

        const overStep = findPath(view, new Vector3(2.5, FEET, 0.5), new Vector3(9.5, FEET, 0.5));
        expect(overStep).not.toBeNull();

        // The step can be climbed, so the route stays on the direct line rather than detouring.
        expect(overStep!.every((point) => Math.abs(point.getZ() - 0.5) < 6)).toBe(true);
    });

    it('does not walk into unloaded chunks', () => {
        // Off the edge of what has been generated. Reading unloaded space as solid is what keeps
        // a mob from wandering into the void and falling forever.
        expect(findPath(view, new Vector3(2.5, FEET, 2.5), new Vector3(200.5, FEET, 200.5))).toBeNull();
    });

    it('finds a stroll fast enough to do it for a crowd inside one tick', () => {
        // A search is the most expensive thing a mob does, and it happens on the tick thread. When
        // the open set was kept sorted rather than in a heap it cost milliseconds apiece, so a
        // field of animals all deciding where to go made the tick run late - and a late tick looks
        // exactly like stuttering however smooth the movement model underneath is.
        //
        // A tick is 50ms. Thirty strolls - far more than a real tick ever starts at once, since a
        // mob only strolls on a one in a hundred and twenty roll - have to fit in a fraction of it.
        const start = process.hrtime.bigint();
        for (let index = 0; index < 30; index++) {
            findPath(view, new Vector3(2.5, FEET, 2.5), new Vector3(11.5, FEET, 9.5));
        }
        const millis = Number(process.hrtime.bigint() - start) / 1e6;

        expect(millis).toBeLessThan(25);
    });
});

describe('path following', () => {
    it('aims ahead of the mob rather than at the next corner', () => {
        // Steering at the next waypoint makes a mob pivot on the spot at every corner. Aiming at a
        // point further along the route makes it lean into the turn instead, which is the
        // difference between a mob on rails and one that looks like it is going somewhere.
        const follower = new PathFollower();
        follower.setPath([new Vector3(0.5, 65, 0.5), new Vector3(0.5, 65, 4.5), new Vector3(4.5, 65, 4.5)]);

        const steer = follower.steerFrom(new Vector3(0.5, 65, 3.5));
        expect(steer).not.toBeNull();

        // The corner is at (0.5, 4.5). Looking ahead should already have started to carry the
        // target round it towards the next leg.
        expect(steer!.getX()).toBeGreaterThan(0.5);
    });

    it('finishes when the last waypoint is reached', () => {
        const follower = new PathFollower();
        follower.setPath([new Vector3(0.5, 65, 0.5), new Vector3(2.5, 65, 0.5)]);

        expect(follower.steerFrom(new Vector3(0.5, 65, 0.5))).not.toBeNull();
        expect(follower.steerFrom(new Vector3(2.5, 65, 0.5))).toBeNull();
        expect(follower.isDone()).toBe(true);
    });
});

describe('mob movement', () => {
    let world: TestWorld;
    let mob: Mob;

    beforeEach(() => {
        world = new TestWorld().flatGround(3, GROUND);
        mob = new InertMob({ position: positionIn(world, 2.5, FEET, 2.5) });
    });

    /** Runs the mob for a while, recording where it was each tick. */
    const run = async (ticks: number): Promise<Vector3[]> => {
        const track: Vector3[] = [];
        for (let tick = 0; tick < ticks; tick++) {
            await mob.update(tick);
            const at = mob.getPosition();
            track.push(new Vector3(at.getX(), at.getY(), at.getZ()));
        }

        return track;
    };

    it('rests on the ground instead of sinking or hovering', async () => {
        const track = await run(30);

        for (const at of track) expect(at.getY()).toBe(FEET);
        expect(mob.isOnGround()).toBe(true);
    });

    it('jumps high enough to reach the top of a block', async () => {
        // Vanilla's impulse, gravity and drag give an arc that peaks at 1.252 blocks, and every
        // bit of a mob's ability to climb rests on that number being over 1. Taking gravity off
        // the velocity *before* integrating it spends the whole first tick of the jump and peaks
        // at 0.832 instead - which cannot reach a one-block step, so a mob jumps, falls short,
        // lands, and jumps again until it gives up and wanders off. All the constants were right;
        // only the order was wrong, and nothing about the constants shows it.
        const jumper = new JumpingMob({ position: positionIn(world, 2.5, FEET, 2.5) });
        jumper.launch(JUMP_POWER);

        let peak = FEET;
        for (let tick = 0; tick < 40; tick++) {
            await jumper.update(tick);
            peak = Math.max(peak, jumper.getPosition().getY());
        }

        expect(peak - FEET).toBeGreaterThan(1);
        expect(peak - FEET).toBeCloseTo(1.25, 1);

        // And it comes back down rather than hanging there.
        expect(jumper.getPosition().getY()).toBe(FEET);
        expect(jumper.isOnGround()).toBe(true);
    });

    it('climbs a one-block step rather than bouncing off it', async () => {
        // The behaviour the arc above exists for, and the one that was actually visible: the
        // navigator happily routes over a one-block step - there is a test above proving it - so
        // the mob walks up to it and jumps. Whether it *arrives* is a question about the physics,
        // and nothing in the pathfinding tests could have caught it falling short.
        world.wall(6, -8, 6, 8, FEET, FEET);

        expect(mob.moveTo(new Vector3(10.5, FEET, 2.5))).toBe(true);
        await run(200);

        const at = mob.getPosition();
        expect(at.getX()).toBeGreaterThan(7);
        expect(at.getY()).toBe(FEET);
    });

    it('ambles rather than sprints', async () => {
        // The number that matters, in the unit anyone can judge it in: a player walks at 4.317
        // blocks a second and sprints at 5.6. An animal pottering about has to be clearly slower
        // than a walking player, or it reads as fleeing. It was 3.6 and looked like it was.
        mob.moveTo(new Vector3(20.5, FEET, 2.5));
        const track = await run(140);

        const settled = track.slice(40, 120);
        const perTick = settled
            .slice(1)
            .map((at, index) => Math.hypot(at.getX() - settled[index]!.getX(), at.getZ() - settled[index]!.getZ()));

        const blocksPerSecond = (perTick.reduce((sum, step) => sum + step, 0) / perTick.length) * 20;

        expect(blocksPerSecond).toBeGreaterThan(1.2);
        expect(blocksPerSecond).toBeLessThan(2.6);
    });

    it('walks at the speed it was told to, not a fraction of it', async () => {
        // The velocity model approaches the desired velocity rather than damping it, so `walkSpeed`
        // is the speed actually walked. When acceleration and friction were both applied the
        // settled speed came out at two thirds of it, and every speed in the codebase was a lie.
        mob.moveTo(new Vector3(30.5, FEET, 2.5), 0.15);
        const track = await run(160);

        const settled = track.slice(60, 140);
        const perTick = settled
            .slice(1)
            .map((at, index) => Math.hypot(at.getX() - settled[index]!.getX(), at.getZ() - settled[index]!.getZ()));

        const average = perTick.reduce((sum, step) => sum + step, 0) / perTick.length;
        expect(average).toBeGreaterThan(0.14);
        expect(average).toBeLessThan(0.16);
    });

    it('walks to where it is sent', async () => {
        expect(mob.moveTo(new Vector3(18.5, FEET, 2.5))).toBe(true);
        await run(220);

        const at = mob.getPosition();
        expect(Math.hypot(at.getX() - 18.5, at.getZ() - 2.5)).toBeLessThan(1.5);
    });

    it('never jumps position, however far it is walking', async () => {
        // The heart of it: a mob's position between two waypoints has to be a place it actually
        // passed through. A step much larger than its speed means it was teleported, which is what
        // stuttering looks like from the client's side.
        mob.moveTo(new Vector3(20.5, FEET, 14.5));
        const track = await run(200);

        for (let index = 1; index < track.length; index++) {
            const step = Math.hypot(
                track[index]!.getX() - track[index - 1]!.getX(),
                track[index]!.getZ() - track[index - 1]!.getZ()
            );

            // Walking speed is 0.21 blocks per tick; anything beyond that is not walking.
            expect(step).toBeLessThanOrEqual(0.25);
        }
    });

    it('accelerates instead of switching speed', async () => {
        // A mob given a destination should get up to speed over several ticks. Reaching full speed
        // in one is a jerk, and jerks are what the acceleration exists to remove.
        mob.moveTo(new Vector3(20.5, FEET, 2.5));
        const track = await run(120);

        const speeds = track
            .slice(1)
            .map((at, index) => Math.hypot(at.getX() - track[index]!.getX(), at.getZ() - track[index]!.getZ()));

        // No tick may change the speed by much - that is what "smooth" means, measured.
        for (let index = 1; index < speeds.length; index++) {
            expect(Math.abs(speeds[index]! - speeds[index - 1]!)).toBeLessThan(0.06);
        }

        // And it did get moving, up to the speed it was given rather than some fraction of it.
        expect(Math.max(...speeds)).toBeCloseTo(WALK_SPEED, 3);
    });

    it('turns at a limited rate rather than snapping round', async () => {
        // A mob that faces its destination instantly reads as mechanical however smooth its path
        // is. Both the body and the head take the short way round, a few degrees a tick.
        mob.moveTo(new Vector3(20.5, FEET, 2.5));

        const yaws: number[] = [];
        for (let tick = 0; tick < 160; tick++) {
            await mob.update(tick);
            yaws.push(mob.yaw);

            // Send it back the other way once under way, which is the hardest turn there is.
            if (tick === 80) mob.moveTo(new Vector3(-20.5, FEET, 2.5));
        }

        for (let index = 1; index < yaws.length; index++) {
            expect(Math.abs(Mob.angleBetween(yaws[index - 1]!, yaws[index]!))).toBeLessThanOrEqual(18.001);
        }
    });

    it('says nothing to clients while it stands still', async () => {
        // A world of idle mobs would otherwise cost a packet each per tick to report that nothing
        // has happened.
        await run(40);
        expect(world.broadcasts).toBe(0);

        mob.moveTo(new Vector3(12.5, FEET, 2.5));
        await run(40);
        expect(world.broadcasts).toBeGreaterThan(0);
    });

    it('reports a turn of the head even when standing perfectly still', async () => {
        // A villager watching you walk past moves nothing but its head and its pitch. Reporting
        // only position and body yaw finds nothing to say, and the head sits frozen at whatever
        // angle it was last sent at - which is exactly what it looks like.
        await run(5);
        const settled = world.broadcasts;

        // Off to the side, so it is the head yaw that has to move. Looking straight down the mob's
        // own heading only changes the pitch, and by less than a degree at any useful distance -
        // which would make this a test of the broadcast threshold rather than of the head.
        for (let tick = 0; tick < 20; tick++) {
            mob.lookAt(new Vector3(20.5, FEET + 1, 2.5));
            await mob.update(tick);
        }

        expect(mob.getPosition().getX()).toBe(2.5); // it really did not move
        expect(world.broadcasts).toBeGreaterThan(settled);
    });

    it('stands still when its chunk is not loaded', async () => {
        // Every block around an unloaded mob reads as solid, so ticking it would have it thrash
        // against walls that are not there.
        const stranded = new InertMob({ position: positionIn(world, 500.5, FEET, 500.5) });
        await stranded.update(0);

        expect(stranded.getPosition().getY()).toBe(FEET);
        expect(world.broadcasts).toBe(0);
    });

    it('slides along a wall instead of stopping dead against it', async () => {
        world.wall(10, -20, 10, 20, FEET, FEET + 3);

        // Aimed diagonally into the wall, so the only way the mob makes ground along z is by
        // sliding: the axis into the wall is lost, the one along it is kept.
        mob = new InertMob({ position: positionIn(world, 8.5, FEET, 0.5) });

        const startZ = mob.getPosition().getZ();
        for (let tick = 0; tick < 40; tick++) {
            mob.steerTowards(1, 0.5);
            await mob.update(tick);
        }

        expect(mob.getPosition().getX()).toBeLessThan(10);
        expect(mob.getPosition().getZ()).toBeGreaterThan(startZ + 1);
    });
});

describe('mob body', () => {
    let world: TestWorld;
    let mob: Mob;

    /** A sheep, 0.9 across, so half of it is 0.45 either side of where it stands. */
    const HALF_WIDTH = 0.45;

    beforeEach(() => {
        world = new TestWorld().flatGround(3, GROUND);
        mob = new InertMob({ position: positionIn(world, 2.5, FEET, 2.5) });
    });

    const walkInto = async (ticks: number, dx: number, dz: number): Promise<void> => {
        for (let tick = 0; tick < ticks; tick++) {
            mob.steerTowards(dx, dz);
            await mob.update(tick);
        }
    };

    it('stops with its body against a wall, not with its body inside one', async () => {
        // The reported bug, measured. A mob collided as a point walks until its *centre* meets the
        // wall, which for a body 0.9 across leaves 0.45 of sheep inside the stone - and looks
        // exactly like what it is. The face of the wall at x = 10 is the only number here; where
        // the mob may stand follows from its own width.
        world.wall(10, -20, 10, 20, FEET, FEET + 3);

        await walkInto(80, 1, 0);

        expect(mob.getPosition().getX()).toBeLessThanOrEqual(10 - HALF_WIDTH);
        // And it did walk up to the wall rather than stopping somewhere short of it.
        expect(mob.getPosition().getX()).toBeGreaterThan(10 - HALF_WIDTH - 0.2);
    });

    it('walks up onto a slab instead of jumping onto it', async () => {
        // Half a block is a step, not an obstacle. Jumping at one is what a mob does when the
        // world is only ever solid or not, and it reads as a bad hop over flat ground.
        for (let x = 6; x <= 12; x++) world.barrier(x, -4, 8, FEET, 'minecraft:oak_slab');

        const heights: number[] = [];
        for (let tick = 0; tick < 90; tick++) {
            mob.steerTowards(1, 0);
            await mob.update(tick);
            heights.push(mob.getPosition().getY());
        }

        // It got up onto the slabs, whose surface is half a block above the grass.
        expect(mob.getPosition().getX()).toBeGreaterThan(7);
        expect(mob.getPosition().getY()).toBeCloseTo(FEET + 0.5, 5);

        // And never went higher than them: a jump would have taken it well over a block up.
        expect(Math.max(...heights)).toBeLessThan(FEET + 0.6);
    });

    it('cannot get over a fence, and does not spend forever trying', async () => {
        // A fence is a block and a half, which is precisely more than a jump clears. Modelled as
        // an ordinary cube - which is what it was - every animal in the pen hops straight out.
        world.barrier(6, -4, 8, FEET, 'minecraft:oak_fence');

        await walkInto(120, 1, 0);

        expect(mob.getPosition().getX()).toBeLessThanOrEqual(6 - HALF_WIDTH);
        expect(mob.getPosition().getY()).toBe(FEET);
    });

    it('routes around a fence rather than through it', () => {
        // A fence with a gap at one end. If the planner thought a fence was jumpable it would send
        // the mob straight at it, and the mob would be stuck against it until it gave up.
        world.barrier(8, -10, 6, FEET, 'minecraft:oak_fence');

        const view = new BlockView(world.asWorld());
        const path = findPath(view, new Vector3(2.5, FEET, 0.5), new Vector3(14.5, FEET, 0.5), {
            height: 1.3,
            width: 0.9
        });

        expect(path).not.toBeNull();
        expect(path!.some((point) => point.getZ() > 6)).toBe(true);
    });

    it('refuses a gap its body does not fit through', () => {
        // A wall long enough that going round it is out of the search's reach, with a one-block
        // doorway punched through it. A sheep fits; a spider, 1.4 across, does not - and used to,
        // because the only thing that ever had to fit was a point.
        world.wall(10, -30, 10, -1, FEET, FEET + 3);
        world.wall(10, 1, 10, 30, FEET, FEET + 3);

        const view = new BlockView(world.asWorld());
        const from = new Vector3(2.5, FEET, 0.5);
        const to = new Vector3(14.5, FEET, 0.5);
        const crossesTheWall = (path: Vector3[] | null): boolean => path?.some((at) => at.getX() > 10) ?? false;

        // Not "is there a path" - a blocked search still hands back the best partial route it
        // found, which is the right answer for a mob that should walk towards its goal anyway.
        // The question is whether the route goes through the wall.
        expect(crossesTheWall(findPath(view, from, to, { height: 1.3, width: 0.9 }))).toBe(true);
        expect(crossesTheWall(findPath(view, from, to, { height: 0.9, width: 1.4 }))).toBe(false);
    });
});

describe('mobs pushing each other', () => {
    let world: TestWorld;

    beforeEach(() => {
        world = new TestWorld().flatGround(3, GROUND);
    });

    /** Two mobs, in the grid, ticked together the way the world ticks them. */
    const herd = async (positions: Array<[number, number]>, ticks: number): Promise<Mob[]> => {
        const mobs = positions.map(([x, z]) => new InertMob({ position: positionIn(world, x, FEET, z) }));

        for (let tick = 0; tick < ticks; tick++) {
            world.entityGrid.rebuild(mobs);
            for (const mob of mobs) await mob.update(tick);
        }

        return mobs;
    };

    const between = (a: Mob, b: Mob): number =>
        Math.hypot(a.getPosition().getX() - b.getPosition().getX(), a.getPosition().getZ() - b.getPosition().getZ());

    it('separates two mobs standing inside each other', async () => {
        // Six animals sent to the same spot used to arrive as one animal-shaped pile of six.
        const [first, second] = await herd(
            [
                [2.5, 2.5],
                [2.7, 2.5]
            ],
            120
        );

        // Two sheep 0.9 across are clear of each other at 0.9 apart.
        expect(between(first!, second!)).toBeGreaterThanOrEqual(0.9 - 0.05);
    });

    it('picks a direction even for two mobs on exactly the same spot', async () => {
        // No direction to push along, so one has to be chosen - and chosen the same way every
        // tick, or the two of them shuffle on the spot forever instead of separating.
        const [first, second] = await herd(
            [
                [2.5, 2.5],
                [2.5, 2.5]
            ],
            120
        );

        expect(between(first!, second!)).toBeGreaterThan(0.5);
    });

    it('settles once they are apart rather than jittering', async () => {
        const mobs = await herd(
            [
                [2.5, 2.5],
                [2.7, 2.5]
            ],
            140
        );

        const before = mobs.map((mob) => mob.getPosition());
        for (let tick = 0; tick < 20; tick++) {
            world.entityGrid.rebuild(mobs);
            for (const mob of mobs) await mob.update(tick);
        }

        for (const [index, mob] of mobs.entries()) {
            const moved = Math.hypot(
                mob.getPosition().getX() - before[index]!.getX(),
                mob.getPosition().getZ() - before[index]!.getZ()
            );

            expect(moved).toBeLessThan(0.05);
        }
    });

    it('is shoved by a player of any height it overlaps', async () => {
        // Reported from a running server: a villager could be pushed and a cow, a sheep, a chicken
        // and a spider could not. A player's position is its *eyes*, 1.62 up, so read as feet it
        // put the player's body from chest height upwards - and then the only mobs overlapping it
        // were the ones over 1.62 tall. Every short animal was, geometrically, underground.
        const shortMob = new InertMob({ position: positionIn(world, 2.5, FEET, 2.5) });

        // Standing in the same spot, reporting its position the way a Bedrock client does.
        const player = new InertMob({ position: positionIn(world, 2.5, FEET + 1.62, 2.5) });
        vi.spyOn(player, 'getFeetY').mockReturnValue(FEET);

        for (let tick = 0; tick < 60; tick++) {
            world.entityGrid.rebuild([shortMob, player]);
            await shortMob.update(tick);
        }

        const moved = Math.hypot(shortMob.getPosition().getX() - 2.5, shortMob.getPosition().getZ() - 2.5);
        expect(moved).toBeGreaterThan(0.5);
    });

    it('leaves items and arrows alone', async () => {
        // Only living things displace each other. A mob shoving itself away from every dropped
        // item it walks over would look possessed, and cost a push per item per tick.
        const mob = new InertMob({ position: positionIn(world, 2.5, FEET, 2.5) });
        const item = new InertMob({ position: positionIn(world, 2.5, FEET, 2.5) });
        // Anything that does not occupy space, standing in exactly the same place.
        vi.spyOn(item, 'occupiesSpace').mockReturnValue(false);

        for (let tick = 0; tick < 40; tick++) {
            world.entityGrid.rebuild([mob, item]);
            await mob.update(tick);
        }

        expect(mob.getPosition().getX()).toBe(2.5);
        expect(mob.getPosition().getZ()).toBe(2.5);
    });
});

describe('angles', () => {
    it('takes the short way round the circle', () => {
        expect(Mob.angleBetween(350, 10)).toBeCloseTo(20);
        expect(Mob.angleBetween(10, 350)).toBeCloseTo(-20);
        expect(Mob.angleBetween(0, 179)).toBeCloseTo(179);
        expect(Math.abs(Mob.angleBetween(0, 181))).toBeCloseTo(179);
    });

    it('never turns further than it is allowed to', () => {
        expect(Mob.turnTowards(0, 90, 18)).toBe(18);
        expect(Mob.turnTowards(0, -90, 18)).toBe(-18);
        expect(Mob.turnTowards(0, 5, 18)).toBe(5);

        // 350 to 10 is a 20 degree turn to the right, which is further than one tick allows - so
        // it goes 18 of the way and picks the rest up next tick. Crossing zero must not make it
        // take the 340 degree route the other way.
        expect(Mob.turnTowards(350, 10, 18)).toBe(368);
    });
});
