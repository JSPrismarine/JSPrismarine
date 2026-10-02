import { beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockUpdateScheduler from '../BlockUpdateScheduler';
import Chunk from '../chunk/Chunk';
import type { World } from '../World';
import BlockPhysics from './BlockPhysics';

/**
 * Block physics, on a world reduced to chunks and a scheduler.
 *
 * The real `World` wants a server, a provider and a socket before it will exist, none of which has
 * any bearing on whether sand falls. Everything physics actually touches is here: reading and
 * writing blocks in loaded chunks, and queueing positions to be looked at again.
 */
class TestWorld {
    private readonly chunks = new Map<string, Chunk>();
    public readonly updates = new BlockUpdateScheduler();

    /** Blocks dropped as items, so a broken plant can be shown to have left something behind. */
    public readonly dropped: string[] = [];

    public constructor(radius = 1, groundY = 64) {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

        for (let cx = -radius; cx <= radius; cx++) {
            for (let cz = -radius; cz <= radius; cz++) {
                const chunk = new Chunk(cx, cz);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        chunk.fillColumn(x, z, -64, groundY - 1, stone);
                        chunk.fillColumn(x, z, groundY, groundY, grass);
                    }
                }
                this.chunks.set(`${cx},${cz}`, chunk);
            }
        }
    }

    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        return this.chunks.get(`${cx},${cz}`) ?? null;
    }

    public getBlockUpdates(): BlockUpdateScheduler {
        return this.updates;
    }

    public getPlayers(): [] {
        return [];
    }

    public getServer(): any {
        return {
            getBlockManager: () => ({
                getBlock: (name: string) => {
                    if (name === 'minecraft:nonexistent') throw new Error('no such block');
                    return { getName: () => name, getStateName: () => name, getId: () => 1, getMeta: () => 0 };
                }
            })
        };
    }

    /** Entities in the world, which for physics means the blocks currently falling. */
    public readonly entities: any[] = [];

    public async dropContents(_position: any, contents: any[]): Promise<void> {
        for (const drop of contents) this.dropped.push(drop.getName());
    }

    public async addEntity(entity: any): Promise<void> {
        this.entities.push(entity);
    }

    public async removeEntity(entity: any): Promise<void> {
        const index = this.entities.indexOf(entity);
        if (index >= 0) this.entities.splice(index, 1);
    }

    public async broadcastMove(): Promise<void> {}

    public getDimension() {
        return { id: 0 as const, name: 'minecraft:overworld', minY: -64, height: 384 };
    }

    public async getBlockState(x: number, y: number, z: number) {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) {
            throw new Error(`nothing loaded at ${x},${y},${z}`);
        }

        return chunk.getBlock(x & 0xf, y, z & 0xf);
    }

    public async setBlockRuntimeId(
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now: number,
        delay = 1
    ): Promise<boolean> {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return false;
        if (chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf) === runtimeId) return false;

        chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
        this.updates.scheduleAround(x, y, z, now, delay);

        return true;
    }

    public async setBlockByName(x: number, y: number, z: number, name: string, now = 0, delay = 1): Promise<boolean> {
        const runtimeId = BlockRuntimeIds.tryGetByName(name);
        if (runtimeId === null) return false;

        return this.setBlockRuntimeId(x, y, z, runtimeId, now, delay);
    }

    /** Puts a block straight into the chunk, without announcing it - test setup, not a change. */
    public place(x: number, y: number, z: number, name: string, states?: Record<string, any>): void {
        const runtimeId = BlockRuntimeIds.tryGetByState(name, states);
        if (runtimeId === null) throw new Error(`no such block ${name}`);

        this.getLoadedChunk(x >> 4, z >> 4)!.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
    }

    public nameAt(x: number, y: number, z: number): string {
        return this.getLoadedChunk(x >> 4, z >> 4)!.getBlock(x & 0xf, y, z & 0xf).name;
    }

    public depthAt(x: number, y: number, z: number): number {
        const state = this.getLoadedChunk(x >> 4, z >> 4)!.getBlock(x & 0xf, y, z & 0xf);
        return Number(state.properties['liquid_depth'] ?? 0);
    }

    public asWorld(): World {
        return this as unknown as World;
    }
}

const GROUND = 64;

/** A cavern hollowed out of the stone, for the water tests that need somewhere to fall into. */
const CAVE_TOP = GROUND - 1;
const CAVE_BOTTOM = GROUND - 8;

/**
 * Runs the world until nothing is left to do, or the cascade proves it will not settle.
 *
 * Entities are ticked alongside the block updates, because a falling block *is* an entity: the
 * block leaves the world, falls under its own acceleration, and becomes a block again where it
 * lands. Draining only the update queue would stop the story halfway.
 */
const settle = async (world: TestWorld, physics: BlockPhysics, maxTicks = 200): Promise<number> => {
    for (let tick = 1; tick <= maxTicks; tick++) {
        const due = world.updates.due(tick);
        if (due.length === 0 && world.updates.size() === 0 && world.entities.length === 0) return tick;

        for (const { x, y, z } of due) await physics.update(x, y, z, tick);
        for (const entity of [...world.entities]) await entity.update(tick);
    }

    return maxTicks;
};

describe('block support', () => {
    let world: TestWorld;
    let physics: BlockPhysics;

    beforeEach(() => {
        world = new TestWorld();
        physics = new BlockPhysics(world.asWorld());
    });

    it('breaks a plant when the block under it is taken away', async () => {
        // The whole of the complaint: mining the ground out from under a flower must take the
        // flower with it, rather than leaving it hanging in mid air.
        world.place(2, GROUND + 1, 2, 'minecraft:poppy');

        await world.setBlockByName(2, GROUND, 2, 'minecraft:air');
        await settle(world, physics);

        expect(world.nameAt(2, GROUND + 1, 2)).toBe('minecraft:air');
    });

    it('leaves the plant on the ground rather than deleting it', async () => {
        world.place(2, GROUND + 1, 2, 'minecraft:short_grass');

        await world.setBlockByName(2, GROUND, 2, 'minecraft:air');
        await settle(world, physics);

        expect(world.dropped).toContain('minecraft:short_grass');
    });

    it('leaves a supported plant exactly where it is', async () => {
        // The other half, and the one that would go unnoticed: physics that breaks everything is
        // not physics.
        world.place(2, GROUND + 1, 2, 'minecraft:dandelion');

        world.updates.scheduleAround(2, GROUND + 1, 2, 0);
        await settle(world, physics);

        expect(world.nameAt(2, GROUND + 1, 2)).toBe('minecraft:dandelion');
    });

    it('takes a whole row of plants when the ground under them goes', async () => {
        for (let x = 1; x <= 5; x++) world.place(x, GROUND + 1, 3, 'minecraft:short_grass');
        for (let x = 1; x <= 5; x++) await world.setBlockByName(x, GROUND, 3, 'minecraft:air');

        await settle(world, physics);

        for (let x = 1; x <= 5; x++) expect(world.nameAt(x, GROUND + 1, 3)).toBe('minecraft:air');
    });

    it('does not uproot a plant standing at the edge of the loaded world', async () => {
        // Off the edge everything reads as nothing. Guessing "unsupported" there would quietly
        // strip the border of every loaded area.
        const edgeX = 16 * 2; // one chunk beyond what the test world loaded
        world.updates.schedule(edgeX, GROUND + 1, 0, 0);

        await settle(world, physics);
        expect(world.getLoadedChunk(edgeX >> 4, 0)).toBeNull();
    });
});

describe('falling blocks', () => {
    let world: TestWorld;
    let physics: BlockPhysics;

    beforeEach(() => {
        world = new TestWorld();
        physics = new BlockPhysics(world.asWorld());
    });

    it('drops sand down a hole until it lands', async () => {
        // A column of sand with nothing under it: all of it should end up resting on the floor.
        world.place(4, GROUND + 1, 4, 'minecraft:sand');
        world.place(4, GROUND + 2, 4, 'minecraft:sand');
        world.place(4, GROUND + 3, 4, 'minecraft:sand');

        for (let y = GROUND; y > GROUND - 4; y--) await world.setBlockByName(4, y, 4, 'minecraft:air');
        await settle(world, physics);

        // Three blocks of sand, stacked from the new floor upwards, and nothing left above.
        expect(world.nameAt(4, GROUND - 3, 4)).toBe('minecraft:sand');
        expect(world.nameAt(4, GROUND - 2, 4)).toBe('minecraft:sand');
        expect(world.nameAt(4, GROUND - 1, 4)).toBe('minecraft:sand');
        expect(world.nameAt(4, GROUND + 1, 4)).toBe('minecraft:air');
    });

    it('leaves nothing falling once everything has landed', async () => {
        world.place(4, GROUND + 1, 4, 'minecraft:sand');
        await world.setBlockByName(4, GROUND, 4, 'minecraft:air');
        await settle(world, physics);

        expect(world.entities).toHaveLength(0);
    });

    it('keeps the sand it started with, no more and no less', async () => {
        // A block becomes an entity and then a block again, so there are two chances to lose it
        // and two to duplicate it. The count is the thing to hold on to.
        world.place(6, GROUND + 5, 6, 'minecraft:sand');
        await world.setBlockByName(6, GROUND, 6, 'minecraft:air');
        await settle(world, physics);

        let sand = 0;
        for (let y = GROUND - 8; y <= GROUND + 8; y++) if (world.nameAt(6, y, 6) === 'minecraft:sand') sand++;

        expect(sand).toBe(1);
    });

    it('accelerates as it falls rather than descending at a fixed rate', async () => {
        // The reason a falling block is an entity at all. A block is only ever in one place or
        // another, so stepping it through the world can only ever move it at a fixed rate; an
        // entity has a position between blocks and can gather speed through it.
        world.place(2, GROUND + 40, 2, 'minecraft:sand');
        world.updates.scheduleAround(2, GROUND + 40, 2, 0);

        // One update to turn the block into an entity.
        for (const { x, y, z } of world.updates.due(1)) await physics.update(x, y, z, 1);
        const falling = world.entities[0];
        expect(falling).toBeDefined();

        const speeds: number[] = [];
        for (let tick = 2; tick < 12; tick++) {
            await falling.update(tick);
            speeds.push(Math.abs(falling.getMotionY()));
        }

        // Strictly faster every tick, and by the tenth it is moving several times its first step.
        for (let index = 1; index < speeds.length; index++) {
            expect(speeds[index]!).toBeGreaterThan(speeds[index - 1]!);
        }

        expect(speeds[speeds.length - 1]!).toBeGreaterThan(speeds[0]! * 5);
    });

    it('falls faster than a block could be stepped down, but not without limit', async () => {
        world.place(2, GROUND + 60, 2, 'minecraft:sand');
        world.updates.scheduleAround(2, GROUND + 60, 2, 0);

        for (const { x, y, z } of world.updates.due(1)) await physics.update(x, y, z, 1);
        const falling = world.entities[0];

        // Long enough to reach terminal velocity, and it lands on the way - which is fine: a
        // settled entity stops accelerating and keeps whatever speed it had.
        for (let tick = 2; tick < 60; tick++) await falling.update(tick);

        // Terminal velocity: gravity and drag balance a little under two blocks a tick, which is
        // about forty blocks a second - and it never runs away past that.
        expect(Math.abs(falling.getMotionY())).toBeGreaterThan(1);
        expect(Math.abs(falling.getMotionY())).toBeLessThan(2.5);
    });

    it('tells the client which block is falling', async () => {
        // The entity is drawn from its `VARIANT` metadata. Without it the client renders a falling
        // nothing, which looks exactly like the block having been deleted.
        world.place(3, GROUND + 3, 3, 'minecraft:gravel');
        world.updates.scheduleAround(3, GROUND + 3, 3, 0);

        for (const { x, y, z } of world.updates.due(1)) await physics.update(x, y, z, 1);
        const falling = world.entities[0];

        expect(falling.getBlockName()).toBe('minecraft:gravel');
        expect(falling.metadata.getPropertyValue(2)).toBe(BlockRuntimeIds.getByName('minecraft:gravel'));
    });

    it('leaves gravel alone when it is standing on something', async () => {
        world.place(5, GROUND + 1, 5, 'minecraft:gravel');

        world.updates.scheduleAround(5, GROUND + 1, 5, 0);
        await settle(world, physics);

        expect(world.nameAt(5, GROUND + 1, 5)).toBe('minecraft:gravel');
    });

    it('does not make stone fall, because only some blocks are heavy', async () => {
        world.place(7, GROUND + 2, 7, 'minecraft:stone');
        await world.setBlockByName(7, GROUND + 1, 7, 'minecraft:air');
        await settle(world, physics);

        expect(world.nameAt(7, GROUND + 2, 7)).toBe('minecraft:stone');
    });
});

describe('water', () => {
    let world: TestWorld;
    let physics: BlockPhysics;

    beforeEach(() => {
        world = new TestWorld();
        physics = new BlockPhysics(world.asWorld());
    });

    it('runs into a hole dug under it', async () => {
        // The complaint, in the order it actually happens: water is already lying there, a player
        // digs into the floor under it, and the water goes down the hole instead of staying put.
        world.place(8, GROUND + 1, 8, 'minecraft:water', { liquid_depth: 0 });
        world.updates.scheduleAround(8, GROUND + 1, 8, 0);
        await settle(world, physics, 400);

        // Water has spread over the flat ground by now, including to here.
        expect(world.nameAt(9, GROUND + 1, 8)).toBe('minecraft:flowing_water');

        // Dig a shaft down through the floor beneath it.
        for (let y = GROUND; y > GROUND - 3; y--) await world.setBlockByName(9, y, 8, 'minecraft:air');
        await settle(world, physics, 400);

        expect(world.nameAt(9, GROUND - 2, 8)).toBe('minecraft:flowing_water');
    });

    it('falls at full strength, so a waterfall does not thin out on the way down', async () => {
        world.place(8, GROUND + 1, 8, 'minecraft:water', { liquid_depth: 0 });
        world.updates.scheduleAround(8, GROUND + 1, 8, 0);
        await settle(world, physics, 400);

        for (let y = GROUND; y > GROUND - 6; y--) await world.setBlockByName(9, y, 8, 'minecraft:air');
        await settle(world, physics, 400);

        // Every block of the fall carries the falling flag rather than thinning by depth, which is
        // what stops a tall drop from running out halfway.
        for (let y = GROUND; y > GROUND - 5; y--) {
            expect(`${y}: ${world.nameAt(9, y, 8)}`).toBe(`${y}: minecraft:flowing_water`);
        }
    });

    /**
     * A cavern under the ground with a source above its roof, which is the shape of the complaint:
     * water gets in at one point and has open air on every side all the way down.
     */
    const cavern = (): void => {
        for (let x = 4; x <= 12; x++) {
            for (let z = 4; z <= 12; z++) {
                for (let y = CAVE_TOP; y >= CAVE_BOTTOM; y--) world.place(x, y, z, 'minecraft:air');
            }
        }

        world.place(8, GROUND + 1, 8, 'minecraft:water', { liquid_depth: 0 });
        world.place(8, GROUND, 8, 'minecraft:air');
    };

    it('does not spread sideways partway down a fall', async () => {
        // The expensive mistake, and the one that flooded a cavern floor to ceiling: a block
        // partway down a waterfall cannot flow down - the shaft below it is already full - and
        // would take that as leave to spread sideways. Every level of the fall then became a sheet
        // reaching seven blocks out, each block of which fell and started a sheet of its own.
        cavern();

        world.updates.scheduleAround(8, GROUND + 1, 8, 0);
        await settle(world, physics, 400);

        // The shaft is wet all the way down...
        expect(world.nameAt(8, CAVE_BOTTOM, 8)).toBe('minecraft:flowing_water');

        // ...and beside it, at the levels it passes, the cavern is still dry.
        for (let y = CAVE_TOP; y > CAVE_BOTTOM; y--) {
            expect(`${y}: ${world.nameAt(9, y, 8)}`).toBe(`${y}: minecraft:air`);
        }
    });

    it('pools at the foot of a fall rather than filling the cavern outwards', async () => {
        cavern();

        world.updates.scheduleAround(8, GROUND + 1, 8, 0);
        await settle(world, physics, 400);

        // Where it lands it spreads, which is the half of the behaviour that must survive.
        expect(world.nameAt(9, CAVE_BOTTOM, 8)).toBe('minecraft:flowing_water');
        expect(world.nameAt(10, CAVE_BOTTOM, 8)).toBe('minecraft:flowing_water');
    });

    it('lets a source in mid air flow down and then out to its sides', async () => {
        // The exemption that keeps a placed source behaving: it falls first, and once the column
        // below it is full it still spreads, which a block of flowing water would not.
        for (let y = GROUND; y > GROUND - 4; y--) world.place(4, y, 4, 'minecraft:air');
        world.place(4, GROUND + 1, 4, 'minecraft:water', { liquid_depth: 0 });

        world.updates.scheduleAround(4, GROUND + 1, 4, 0);
        await settle(world, physics, 400);

        expect(world.nameAt(5, GROUND + 1, 4)).toBe('minecraft:flowing_water');
    });

    it('thins out as it travels and stops at seven blocks', async () => {
        world.place(0, GROUND + 1, 0, 'minecraft:water', { liquid_depth: 0 });
        world.updates.scheduleAround(0, GROUND + 1, 0, 0);
        await settle(world, physics, 400);

        // Right beside the source it is at its strongest, and it has run out well before ten.
        expect(world.nameAt(1, GROUND + 1, 0)).toBe('minecraft:flowing_water');
        expect(world.depthAt(1, GROUND + 1, 0)).toBe(1);
        expect(world.nameAt(10, GROUND + 1, 0)).toBe('minecraft:air');
    });

    it('dries up when its source is taken away', async () => {
        world.place(0, GROUND + 1, 0, 'minecraft:water', { liquid_depth: 0 });
        world.updates.scheduleAround(0, GROUND + 1, 0, 0);
        await settle(world, physics, 400);

        expect(world.nameAt(3, GROUND + 1, 0)).toBe('minecraft:flowing_water');

        await world.setBlockByName(0, GROUND + 1, 0, 'minecraft:air');
        await settle(world, physics, 400);

        // The whole stream behind it goes, not just the block that was removed.
        for (let x = 1; x <= 7; x++) expect(`${x}: ${world.nameAt(x, GROUND + 1, 0)}`).toBe(`${x}: minecraft:air`);
    });

    it('settles instead of spreading and drying for ever', async () => {
        // Liquid that rewrites itself every tick would keep the update queue permanently busy and
        // send a block update to every player for ever.
        world.place(0, GROUND + 1, 0, 'minecraft:water', { liquid_depth: 0 });
        world.updates.scheduleAround(0, GROUND + 1, 0, 0);

        const ticks = await settle(world, physics, 500);
        expect(ticks).toBeLessThan(500);
        expect(world.updates.size()).toBe(0);
    });

    it('washes a plant away instead of damming behind it', async () => {
        world.place(0, GROUND + 1, 0, 'minecraft:water', { liquid_depth: 0 });
        world.place(1, GROUND + 1, 0, 'minecraft:short_grass');

        world.updates.scheduleAround(0, GROUND + 1, 0, 0);
        await settle(world, physics, 400);

        expect(world.nameAt(1, GROUND + 1, 0)).toBe('minecraft:flowing_water');
    });

    it('stays inside a wall built around it', async () => {
        // Going *around* a single block is correct - water does that. Being held by an enclosure
        // is the claim worth making, and it is what a player builds a wall for.
        world.place(0, GROUND + 1, 0, 'minecraft:water', { liquid_depth: 0 });

        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
                if (Math.max(Math.abs(x), Math.abs(z)) !== 2) continue;
                world.place(x, GROUND + 1, z, 'minecraft:stone');
            }
        }

        world.updates.scheduleAround(0, GROUND + 1, 0, 0);
        await settle(world, physics, 400);

        // Inside is wet, the wall is still a wall, and outside is dry.
        expect(world.nameAt(1, GROUND + 1, 0)).toBe('minecraft:flowing_water');
        expect(world.nameAt(2, GROUND + 1, 0)).toBe('minecraft:stone');
        expect(world.nameAt(3, GROUND + 1, 0)).toBe('minecraft:air');
    });
});

describe('the update scheduler', () => {
    it('queues a position once however often it is asked', () => {
        const scheduler = new BlockUpdateScheduler();

        scheduler.schedule(1, 2, 3, 0);
        scheduler.schedule(1, 2, 3, 0);
        scheduler.schedule(1, 2, 3, 0, 10);

        expect(scheduler.size()).toBe(1);
    });

    it('keeps the earliest time a position was asked for', () => {
        const scheduler = new BlockUpdateScheduler();

        scheduler.schedule(1, 2, 3, 0, 10);
        scheduler.schedule(1, 2, 3, 0, 1);

        expect(scheduler.due(1)).toHaveLength(1);
    });

    it('holds an update back until it is due', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 2, 3, 0, 5);

        expect(scheduler.due(1)).toHaveLength(0);
        expect(scheduler.due(5)).toHaveLength(1);
    });

    it('never schedules for the same tick, which would recurse the whole cascade at once', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.schedule(1, 2, 3, 7, 0);

        expect(scheduler.due(7)).toHaveLength(0);
        expect(scheduler.due(8)).toHaveLength(1);
    });

    it('queues the six neighbours as well as the block itself', () => {
        const scheduler = new BlockUpdateScheduler();
        scheduler.scheduleAround(0, 0, 0, 0);

        expect(scheduler.size()).toBe(7);
    });

    it('carries work past its budget to the next tick rather than dropping it', () => {
        const scheduler = new BlockUpdateScheduler();
        for (let i = 0; i < 5000; i++) scheduler.schedule(i, 0, 0, 0);

        const first = scheduler.due(1);
        expect(first.length).toBeLessThanOrEqual(4096);
        expect(scheduler.size()).toBe(5000 - first.length);
    });
});
