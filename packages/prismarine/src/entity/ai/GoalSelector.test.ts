import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../../world/chunk/Chunk';
import EntityGrid from '../../world/EntityGrid';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { Mob } from '../Mob';
import type { Goal } from './Goal';
import { GoalLane } from './Goal';
import GoalSelector from './GoalSelector';

/** A goal that records what was asked of it and does whatever the test says. */
class ScriptedGoal implements Goal {
    public readonly log: string[] = [];
    public wants = true;

    public constructor(
        public readonly name: string,
        public readonly priority: number,
        public readonly lanes: GoalLane[]
    ) {}

    public canUse(): boolean {
        return this.wants;
    }

    public start(): void {
        this.log.push('start');
    }

    public stop(): void {
        this.log.push('stop');
    }

    public tick(): void {
        this.log.push('tick');
    }

    public get running(): boolean {
        return this.log.lastIndexOf('start') > this.log.lastIndexOf('stop');
    }
}

/** Enough of a world for a mob to exist in; see `MobMovement.test.ts` for the fuller one. */
const flatWorld = () => {
    const chunks = new Map<string, Chunk>();
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

    for (let cx = -2; cx <= 2; cx++) {
        for (let cz = -2; cz <= 2; cz++) {
            const chunk = new Chunk(cx, cz);
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    chunk.fillColumn(x, z, -64, 63, stone);
                    chunk.fillColumn(x, z, 64, 64, grass);
                }
            }
            chunks.set(`${cx},${cz}`, chunk);
        }
    }

    // Empty, and that is the point: a mob left to itself has nothing to be pushed by.
    const entityGrid = new EntityGrid();

    return {
        getLoadedChunk: (cx: number, cz: number) => chunks.get(`${cx},${cz}`) ?? null,
        getPlayers: () => [],
        getEntityGrid: () => entityGrid,
        broadcastMove: async () => {},
        getServer: () => ({}),
        getName: () => 'test'
    } as unknown as World;
};

const someMob = (world: World) => new Mob({ position: new Position(2.5, 65, 2.5, world) });

describe('goal selector', () => {
    it('runs a goal whose lanes are free', () => {
        const world = flatWorld();
        const stroll = new ScriptedGoal('stroll', 5, [GoalLane.Move]);
        const selector = new GoalSelector().add(stroll);

        selector.tick(someMob(world));

        expect(stroll.log).toEqual(['start', 'tick']);
    });

    it('lets two goals run at once when they want different parts of the mob', () => {
        // The point of lanes: a mob can walk somewhere and watch you while it does.
        const world = flatWorld();
        const walk = new ScriptedGoal('walk', 5, [GoalLane.Move]);
        const watch = new ScriptedGoal('watch', 6, [GoalLane.Look]);
        const selector = new GoalSelector().add(walk).add(watch);

        selector.tick(someMob(world));

        expect(walk.running).toBe(true);
        expect(watch.running).toBe(true);
    });

    it('gives a contested lane to the more important goal', () => {
        const world = flatWorld();
        const flee = new ScriptedGoal('flee', 1, [GoalLane.Move]);
        const stroll = new ScriptedGoal('stroll', 7, [GoalLane.Move]);
        const selector = new GoalSelector().add(stroll).add(flee);

        selector.tick(someMob(world));

        expect(flee.running).toBe(true);
        expect(stroll.running).toBe(false);
    });

    it('takes a lane off a running goal when something more important wants it', () => {
        // Behaviour must be interruptible: a mob that finished its stroll before reacting to being
        // set on fire would be no use.
        const world = flatWorld();
        const mob = someMob(world);
        const flee = new ScriptedGoal('flee', 1, [GoalLane.Move]);
        const stroll = new ScriptedGoal('stroll', 7, [GoalLane.Move]);

        flee.wants = false;
        const selector = new GoalSelector().add(stroll).add(flee);

        selector.tick(mob);
        expect(stroll.running).toBe(true);

        flee.wants = true;
        selector.tick(mob);

        expect(flee.running).toBe(true);
        expect(stroll.running).toBe(false);
        expect(stroll.log).toContain('stop');
    });

    it('hands the lane back when the important goal is done', () => {
        const world = flatWorld();
        const mob = someMob(world);
        const flee = new ScriptedGoal('flee', 1, [GoalLane.Move]);
        const stroll = new ScriptedGoal('stroll', 7, [GoalLane.Move]);
        const selector = new GoalSelector().add(stroll).add(flee);

        selector.tick(mob);
        expect(flee.running).toBe(true);

        flee.wants = false;
        selector.tick(mob);

        // Freed and reclaimed in the same tick, rather than leaving the mob idle for one.
        expect(flee.running).toBe(false);
        expect(stroll.running).toBe(true);
    });

    it('stops everything on request', () => {
        const world = flatWorld();
        const mob = someMob(world);
        const goal = new ScriptedGoal('goal', 3, [GoalLane.Move]);
        const selector = new GoalSelector().add(goal);

        selector.tick(mob);
        selector.stopAll(mob);

        expect(goal.running).toBe(false);
        expect(selector.getRunning()).toEqual([]);
    });
});

describe('a mob left to itself', () => {
    it('wanders about without leaving the ground or standing still forever', async () => {
        // The default behaviour, end to end: a mob with no instructions should take itself
        // somewhere, on its own, and still be standing on the floor when it gets there.
        const world = flatWorld();
        const mob = someMob(world);
        const start = mob.getPosition();

        let furthest = 0;
        for (let tick = 0; tick < 4000; tick++) {
            await mob.update(tick);

            const at = mob.getPosition();
            furthest = Math.max(furthest, Math.hypot(at.getX() - start.getX(), at.getZ() - start.getZ()));

            // Never through the floor, never hovering above it.
            expect(at.getY()).toBe(65);
        }

        expect(furthest).toBeGreaterThan(2);
    });

    it('spends most of its life standing still, as a real animal does', async () => {
        // The complaint this answers is that the mobs moved too much. Vanilla's `random_stroll`
        // has `interval: 120` - a one in a hundred and twenty chance *per tick* of setting off -
        // so a cow is stationary the large majority of the time and only occasionally ambles
        // somewhere. Anything that walks continuously reads as agitated rather than idle.
        const world = flatWorld();

        // Several mobs, because the wait between strolls is geometric and one animal's sample of
        // it is worth very little.
        const mobs = Array.from({ length: 12 }, () => someMob(world));

        let moving = 0;
        let samples = 0;

        for (let tick = 0; tick < 1200; tick++) {
            for (const mob of mobs) {
                await mob.update(tick);

                samples++;
                if (Math.hypot(mob.getVelocity().getX(), mob.getVelocity().getZ()) > 0.01) moving++;
            }
        }

        const fraction = moving / samples;

        // Comfortably in the minority, but not frozen: they do still go places.
        expect(fraction).toBeGreaterThan(0.02);
        expect(fraction).toBeLessThan(0.5);
    }, 60_000);
});
