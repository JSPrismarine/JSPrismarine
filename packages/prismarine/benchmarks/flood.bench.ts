/**
 * Benchmark: an ocean draining into a large cave.
 *
 * Reproduces the case that takes the tick down: a player mines through the floor of a lake and the
 * water finds a cavern under it. Everything below is the real engine, the real scheduler and the
 * real chunk storage - only the server and the socket are stubbed.
 *
 * The flow itself is `@jsprismarine/engine-systems` now, drained from the scheduled fluid tick
 * list the way `World.update` drains it, with the support and gravity rules still running off the
 * block update queue beside it. Light runs too, because every write queues some and a tick has to
 * pay for it. Random ticking is off, so the numbers are the flood and nothing else.
 *
 * Run: npx tsx packages/prismarine/benchmarks/flood.bench.ts [physics|network|all]
 */
import { Vector3 } from '@jsprismarine/math';
import Zlib from 'zlib';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import BlockUpdateScheduler from '../src/world/BlockUpdateScheduler';
import Chunk from '../src/world/chunk/Chunk';
import { Dimensions } from '../src/world/Dimension';
import { createEngineWorld } from '../src/world/EngineWorld';
import type { SystemBlock } from '../src/world/WorldSystems';
import { WorldSystems } from '../src/world/WorldSystems';
import type { World } from '../src/world/World';
import BlockPhysics from '../src/world/physics/BlockPhysics';

const AIR = BlockRuntimeIds.getByName('minecraft:air');
const STONE = BlockRuntimeIds.getByName('minecraft:stone');
const WATER = BlockRuntimeIds.getByName('minecraft:water');

const CAVE_FLOOR = 30;
const CAVE_CEILING = 40;
const CEILING_TOP = 44;
const SEA_LEVEL = 48;

interface Options {
    /** Model what one connected player costs: 'per-change' is a packet each, 'batched' is a batch a tick. */
    network?: 'per-change' | 'batched';
}

/**
 * The world reduced to what physics touches, but reduced faithfully: chunks are keyed exactly as
 * `World` keys them (a packed number from `Chunk.packXZ`), and every write goes through the same
 * idempotency check, the same `Vector3`, and the same `scheduleAround`.
 */
class BenchWorld {
    private readonly chunks = new Map<number, Chunk>();
    public readonly updates = new BlockUpdateScheduler();
    public currentTick = 0;

    public writes = 0;
    public readonly writesAt = new Map<string, number>();
    public networkMs = 0;
    public networkBytes = 0;
    public deflates = 0;

    public constructor(
        radiusChunks: number,
        private readonly options: Options
    ) {
        for (let cx = -radiusChunks; cx <= radiusChunks; cx++) {
            for (let cz = -radiusChunks; cz <= radiusChunks; cz++) {
                const chunk = new Chunk(cx, cz);

                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        chunk.fillColumn(x, z, -64, CAVE_FLOOR, STONE);
                        chunk.fillColumn(x, z, CAVE_FLOOR + 1, CAVE_CEILING, AIR);
                        chunk.fillColumn(x, z, CAVE_CEILING + 1, CEILING_TOP, STONE);
                        chunk.fillColumn(x, z, CEILING_TOP + 1, SEA_LEVEL, WATER);
                    }
                }

                this.chunks.set(Chunk.packXZ(cx, cz), chunk);
            }
        }
    }

    /**
     * The engine, the scheduler and the light, built the way `World` builds them.
     *
     * Assigned after construction rather than in it, because the engine's world reads this
     * one back and the object has to exist first.
     */
    public systems!: WorldSystems;

    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        return this.chunks.get(Chunk.packXZ(cx, cz)) ?? null;
    }

    /** Every chunk in the region, which is what the random tick pass would visit. */
    public loadedChunks(): Array<{ x: number; z: number }> {
        return [...this.chunks.values()].map((chunk) => ({ x: chunk.getX(), z: chunk.getZ() }));
    }

    public getBlockUpdates(): BlockUpdateScheduler {
        return this.updates;
    }

    public getPlayers(): [] {
        return [];
    }

    public getTicks(): number {
        return this.currentTick;
    }

    public getDimension() {
        return Dimensions.Overworld;
    }

    public playNamedSound(): void {}

    public getServer(): any {
        return {
            getLogger: () => ({ error: (error: unknown) => console.error(error) }),
            getConfig: () => ({ getDifficulty: () => 2 })
        };
    }

    /** `World.loadedBlockAt`: the block at a position, or undefined outside the loaded world. */
    public loadedBlockAt(x: number, y: number, z: number): SystemBlock | undefined {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return undefined;

        const state = chunk.getBlock(x, y, z);
        return { name: state.name, states: state.properties };
    }

    /** `World.setLoadedBlockState`: the synchronous write the engine goes through. */
    public setLoadedBlockState(x: number, y: number, z: number, block: SystemBlock, notifyNeighbors: boolean): boolean {
        const runtimeId = BlockRuntimeIds.tryGetByState(block.name, block.states);
        if (runtimeId === null) return false;

        return this.writeBlock(x, y, z, runtimeId, this.currentTick, 1, notifyNeighbors);
    }

    public async dropFromBlock(): Promise<void> {}
    public async addEntity(): Promise<void> {}
    public async removeEntity(): Promise<void> {}

    public async setBlockRuntimeId(
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now: number = this.currentTick,
        delay = 1
    ): Promise<boolean> {
        return this.writeBlock(x, y, z, runtimeId, now, delay, true);
    }

    /** `World.writeBlockRuntimeId`: the write, the light, the packet and the two update queues. */
    private writeBlock(
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now: number,
        delay: number,
        notifyNeighbors: boolean
    ): boolean {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return false;
        if (chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf) === runtimeId) return false;

        const previous = chunk.getBlock(x, y, z);
        chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
        const state = chunk.getBlock(x, y, z);
        const next: SystemBlock = { name: state.name, states: state.properties };
        this.systems.onBlockChanged({ x, y, z }, { name: previous.name, states: previous.properties }, next);

        void new Vector3(x, y, z);
        this.writes++;

        const key = `${x},${y},${z}`;
        this.writesAt.set(key, (this.writesAt.get(key) ?? 0) + 1);

        if (this.options.network === 'per-change') this.deflate([this.blockUpdateBytes(x, y, z, runtimeId)]);
        if (this.options.network === 'batched') {
            this.pendingBlocks.set(`${x},${y},${z}`, this.blockUpdateBytes(x, y, z, runtimeId));
        }

        this.updates.scheduleAround(x, y, z, now, delay);
        if (notifyNeighbors) this.systems.updateAround({ x, y, z }, next);
        return true;
    }

    /** Block changes waiting for the end of the tick, keyed by position as the replicator keys them. */
    private readonly pendingBlocks = new Map<string, Buffer>();

    /**
     * The end-of-tick flush: every change this tick, in one batch, compressed once.
     */
    public flushBlockChanges(): void {
        if (this.pendingBlocks.size === 0) return;

        const bodies = [...this.pendingBlocks.values()];
        this.pendingBlocks.clear();
        this.deflate(bodies);
    }

    /** An `UpdateBlockPacket` body, written by hand so the benchmark needs no protocol registry. */
    private blockUpdateBytes(x: number, y: number, z: number, runtimeId: number): Buffer {
        const body = Buffer.alloc(24);
        body.writeUInt8(0x15, 0);
        body.writeInt32LE(x, 1);
        body.writeInt32LE(y, 5);
        body.writeInt32LE(z, 9);
        body.writeInt32LE(runtimeId, 13);
        body.writeUInt8(3, 17);
        body.writeUInt8(0, 18);

        return body;
    }

    /** What `BatchPacket.encode` costs: one synchronous deflate at the configured level. */
    private deflate(bodies: Buffer[]): void {
        const started = performance.now();

        const payload = Buffer.concat(bodies);
        this.networkBytes += Zlib.deflateRawSync(payload, { level: 7 }).byteLength;
        this.deflates++;

        this.networkMs += performance.now() - started;
    }

    public async setBlockByName(
        x: number,
        y: number,
        z: number,
        name: string,
        now: number = this.currentTick,
        delay = 1
    ): Promise<boolean> {
        const runtimeId = BlockRuntimeIds.tryGetByName(name);
        if (runtimeId === null) return false;

        return this.setBlockRuntimeId(x, y, z, runtimeId, now, delay);
    }
}

/** Mines a hole straight through the roof, which is what starts the flood. */
const breachCeiling = async (world: BenchWorld, radius: number): Promise<void> => {
    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            for (let y = CAVE_CEILING + 1; y <= CEILING_TOP; y++) {
                await world.setBlockRuntimeId(x, y, z, AIR, 0, 1);
            }
        }
    }
};

interface Result {
    totalMs: number;
    networkMs: number;
    networkBytes: number;
    deflates: number;
    busyTicks: number;
    meanBusyMs: number;
    worstMs: number;
    worstTick: number;
    over50: number;
    writes: number;
    positions: number;
    maxRewrites: number;
    updatesProcessed: number;
    queueLeft: number;
    peakQueue: number;
}

/** A world with its systems attached, as `World`'s constructor leaves one. */
const benchWorld = (radiusChunks: number, options: Options): BenchWorld => {
    const world = new BenchWorld(radiusChunks, options);

    world.systems = new WorldSystems({
        view: {
            dimension: Dimensions.Overworld,
            blockAt: (x, y, z) => world.loadedBlockAt(x, y, z),
            loadedChunks: () => world.loadedChunks(),
            // The flood is what this measures; a random tick pass over the whole region would
            // be a second, unrelated number inside the same total.
            randomTickSpeed: () => 0
        },
        world: createEngineWorld(world as unknown as World)
    });

    return world;
};

const once = async (radiusChunks: number, breachRadius: number, ticks: number, options: Options): Promise<Result> => {
    const world = benchWorld(radiusChunks, options);
    const physics = new BlockPhysics(world as unknown as World);

    await breachCeiling(world, breachRadius);
    world.writes = 0;
    world.writesAt.clear();
    world.networkMs = 0;
    world.networkBytes = 0;
    world.deflates = 0;
    world.flushBlockChanges();

    let totalMs = 0;
    let busyTicks = 0;
    let busyMs = 0;
    let worstMs = 0;
    let worstTick = 0;
    let over50 = 0;
    let updatesProcessed = 0;
    let peakQueue = 0;

    for (let tick = 1; tick <= ticks; tick++) {
        world.currentTick = tick;

        const before = performance.now();
        const due = world.updates.due(tick);
        for (const { x, y, z } of due) await physics.update(x, y, z, tick);
        world.systems.tick(tick);
        world.flushBlockChanges();
        const ms = performance.now() - before;

        totalMs += ms;
        updatesProcessed += due.length;
        peakQueue = Math.max(peakQueue, world.updates.size());

        if (due.length > 0) {
            busyTicks++;
            busyMs += ms;
        }
        if (ms > worstMs) {
            worstMs = ms;
            worstTick = tick;
        }
        if (ms > 50) over50++;
    }

    const rewrites = [...world.writesAt.values()];

    return {
        totalMs,
        networkMs: world.networkMs,
        networkBytes: world.networkBytes,
        deflates: world.deflates,
        busyTicks,
        meanBusyMs: busyMs / Math.max(1, busyTicks),
        worstMs,
        worstTick,
        over50,
        writes: world.writes,
        positions: world.writesAt.size,
        maxRewrites: Math.max(0, ...rewrites),
        updatesProcessed,
        queueLeft: world.updates.size(),
        peakQueue
    };
};

/**
 * Runs the scenario several times and reports the best, which is the one least polluted by the
 * first-call costs the server pays once at boot - chiefly `BlockRuntimeIds.getState`, which indexes
 * some fourteen thousand block states the first time anything reads a block.
 */
const run = async (
    label: string,
    radiusChunks: number,
    breachRadius: number,
    ticks: number,
    options: Options = {}
): Promise<void> => {
    // Warm up: build the reverse state index and let the physics paths reach their optimized tier.
    await once(2, 1, 60, {});

    const runs: Result[] = [];
    for (let i = 0; i < 3; i++) runs.push(await once(radiusChunks, breachRadius, ticks, options));

    const best = runs.reduce((a, b) => (b.totalMs < a.totalMs ? b : a));

    console.log(`\n=== ${label} ===`);
    console.log(`region ${(radiusChunks * 2 + 1) ** 2} chunks | breach ${breachRadius * 2 + 1}^2 | ${ticks} ticks`);
    console.log(
        `total physics    ${best.totalMs.toFixed(1)} ms   (runs: ${runs.map((r) => r.totalMs.toFixed(0)).join(', ')})`
    );
    if (options.network) {
        console.log(`  of which zlib  ${best.networkMs.toFixed(1)} ms in ${best.deflates} deflates`);
        console.log(`  bytes on wire  ${(best.networkBytes / 1024).toFixed(1)} KiB`);
    }
    console.log(`busy ticks       ${best.busyTicks}, mean ${best.meanBusyMs.toFixed(2)} ms`);
    console.log(`worst tick       ${best.worstMs.toFixed(2)} ms (t=${best.worstTick})`);
    console.log(`ticks over 50 ms ${best.over50}`);
    console.log(`updates run      ${best.updatesProcessed}`);
    console.log(`writes           ${best.writes} over ${best.positions} positions`);
    console.log(
        `  churn          ${(best.writes / Math.max(1, best.positions)).toFixed(2)}x, worst position ${best.maxRewrites}`
    );
    console.log(`queue peak/left  ${best.peakQueue} / ${best.queueLeft}`);
};

const mode = process.argv[2] ?? 'all';

if (mode === 'all' || mode === 'physics') {
    await run('physics only, small breach', 4, 1, 400);
    await run('physics only, wide breach', 6, 4, 400);
}

if (mode === 'all' || mode === 'network') {
    await run('one player, packet per change, wide breach', 6, 4, 400, { network: 'per-change' });
    await run('one player, batched per tick, wide breach', 6, 4, 400, { network: 'batched' });
}

// The worst case a player can actually produce by hand: a large area of the roof mined out under
// an ocean, so the cavern takes a waterfall at every one of a few thousand positions at once.
if (mode === 'all' || mode === 'huge') {
    await run('strip mined roof, physics only', 10, 16, 600);
    await run('strip mined roof, packet per change', 10, 16, 600, { network: 'per-change' });
    await run('strip mined roof, batched per tick', 10, 16, 600, { network: 'batched' });
}
