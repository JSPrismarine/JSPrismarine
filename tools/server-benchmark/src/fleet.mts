/**
 * The bots every server gets: the same client, protocol and inputs, over the transport the server
 * definition names.
 *
 * Each bot is a `@jsprismarine/client` `Bot` that sends one `PlayerAuthInput` per tick, as a retail
 * client does, and asks for sub chunks the way a retail client does when a server sends a column in
 * request mode. Without the requests a server that streams terrain on request would look as if it
 * sent almost nothing. The bots never turn on the client blob cache, so every server sends full
 * terrain rather than hashes.
 */
import { Bot, Random } from '@jsprismarine/client';
import { Logger } from '@jsprismarine/logger';
import {
    ChunkRadiusUpdatedPacket,
    LevelChunkPacket,
    SubChunkPacket,
    SubChunkRequestPacket,
    SubChunkRequestResult
} from '@jsprismarine/protocol';

import type { Behavior } from '@jsprismarine/client';

import type { Transport } from './results.mts';

/** The Bedrock overworld starts at y -64, sub chunk -4, which is where a client's requests start. */
const OVERWORLD_MIN_SUB_CHUNK = -4;
const OVERWORLD = 0;

/** Sends an input every tick, standing still, as a retail client does whether or not it moves. */
const stand: Behavior = {
    name: 'stand',
    tick: (context) => context.input()
};

/** What every bot of a fleet has received so far, summed. */
export interface FleetCounters {
    readonly columns: number;
    readonly columnPackets: number;
    readonly sections: number;
    readonly bytesReceived: number;
}

/** One bot and what it received. */
class BenchmarkBot {
    public readonly bot: Bot;
    /** Distinct columns, as `x,z`. */
    private readonly columns = new Set<string>();
    public columnPackets = 0;
    public sections = 0;
    /** Columns whose sub chunks this bot asked for and has no answer to yet. */
    private readonly pending = new Set<string>();
    public lastTerrainAt = 0;
    /** Columns received since {@link BenchmarkBot.markStep}. */
    public columnsSinceMark = 0;
    public readonly grantedRadius = new Set<number>();
    public disconnectReason: string | null = null;
    public joined = false;
    /** Set once the harness itself disconnects the bot, so its own leaving is not a server's kick. */
    public leaving = false;

    public readonly name: string;

    public constructor(
        name: string,
        options: {
            host: string;
            port: number;
            network: Transport;
            viewDistance: number;
            seed: number;
            loginTimeoutMs: number;
        }
    ) {
        this.name = name;
        this.bot = new Bot({
            host: options.host,
            port: options.port,
            network: options.network,
            displayName: name,
            behaviors: [stand],
            random: new Random(options.seed),
            logger: new Logger('error'),
            viewDistance: options.viewDistance,
            loginTimeoutMs: options.loginTimeoutMs
        });
        const client = this.bot.getClient();
        client.getRegistry().registerAll([SubChunkPacket, ChunkRadiusUpdatedPacket]);
        const session = client.getSession();
        session.registerHandler(LevelChunkPacket, {
            phases: ['login', 'play'],
            handle: async (chunk) => {
                this.lastTerrainAt = performance.now();
                this.columnPackets++;
                const key = `${chunk.chunkX},${chunk.chunkZ}`;
                if (!this.columns.has(key)) this.columnsSinceMark++;
                this.columns.add(key);
                if (!chunk.clientSubChunkRequestsEnabled) {
                    this.sections += chunk.subChunkCount;
                    return;
                }
                if (chunk.subChunkCount <= 0 || chunk.dimension !== OVERWORLD) return;
                // One request per column, for every sub chunk from the bottom of the world up to
                // the limit the server named, which is what a client that renders the column asks for.
                const request = new SubChunkRequestPacket();
                request.dimensionType = OVERWORLD;
                request.centerPos = { x: chunk.chunkX, y: OVERWORLD_MIN_SUB_CHUNK, z: chunk.chunkZ };
                request.offsets = Array.from({ length: chunk.subChunkCount }, (_, y) => ({ x: 0, y, z: 0 }));
                this.pending.add(`${chunk.chunkX},${OVERWORLD_MIN_SUB_CHUNK},${chunk.chunkZ}`);
                await session.send(request);
            }
        });
        session.registerHandler(SubChunkPacket, {
            phases: ['login', 'play'],
            handle: (subChunks) => {
                this.lastTerrainAt = performance.now();
                const center = subChunks.centerPos;
                this.pending.delete(`${center.x},${center.y},${center.z}`);
                for (const entry of subChunks.entries) {
                    if (
                        entry.result === SubChunkRequestResult.SUCCESS ||
                        entry.result === SubChunkRequestResult.SUCCESS_ALL_AIR
                    ) {
                        this.sections++;
                    }
                }
            }
        });
        session.registerHandler(ChunkRadiusUpdatedPacket, {
            phases: ['login', 'play'],
            handle: ({ radius }) => {
                this.grantedRadius.add(radius);
            }
        });
        client.on('disconnect', (reason: string) => {
            if (!this.leaving) this.disconnectReason ??= reason;
        });
    }

    public get pendingRequests(): number {
        return this.pending.size;
    }

    public get columnCount(): number {
        return this.columns.size;
    }

    public markStep(): void {
        this.columnsSinceMark = 0;
    }

    public get bytesReceived(): number {
        return this.bot.getClient().getStats().bytesReceived;
    }
}

/** Where the fleet joins, over which transport, how many bots, and how they ask for their view. */
export interface FleetOptions {
    readonly host: string;
    readonly port: number;
    readonly network: Transport;
    readonly bots: number;
    readonly viewDistance: number;
    readonly seed: number;
    readonly loginTimeoutMs: number;
    /** Time between one bot starting to join and the next. */
    readonly rampMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The bots of one run. They join one server, count what it sends them, and wait together for their
 * views to settle; the harness reads the counters at each phase boundary.
 */
export class BenchmarkFleet {
    private readonly options: FleetOptions;
    private readonly bots: BenchmarkBot[];
    private stopped = false;

    public constructor(options: FleetOptions) {
        this.options = options;
        this.bots = Array.from(
            { length: options.bots },
            (_, index) =>
                new BenchmarkBot(`Bot${index}`, {
                    host: options.host,
                    port: options.port,
                    network: options.network,
                    viewDistance: options.viewDistance,
                    seed: options.seed + index,
                    loginTimeoutMs: options.loginTimeoutMs
                })
        );
    }

    /** The bots' player names, which the server's console commands name. */
    public get names(): string[] {
        return this.bots.map((bot) => bot.name);
    }

    /** Joins one bot, so the caller can time the first join on its own. */
    public async joinFirst(): Promise<void> {
        await this.join(this.bots[0]!);
    }

    /** Joins every bot not yet in the world, one every `rampMs`. Throws with the first failure. */
    public async joinRest(): Promise<void> {
        // Settled as they start, so a login that fails during the ramp's sleep is not an unhandled
        // rejection that ends the process before the run records it.
        const joins: Promise<PromiseSettledResult<void>>[] = [];
        for (const bot of this.bots) {
            if (bot.joined) continue;
            joins.push(
                this.join(bot).then(
                    (value) => ({ status: 'fulfilled', value }) as const,
                    (reason: unknown) => ({ status: 'rejected', reason }) as const
                )
            );
            await sleep(this.options.rampMs);
        }
        for (const result of await Promise.all(joins)) {
            if (result.status === 'rejected') throw result.reason;
        }
    }

    private async join(bot: BenchmarkBot): Promise<void> {
        await bot.bot.connect();
        bot.joined = true;
        bot.bot.start();
    }

    /** What the bots have received so far. */
    public counters(): FleetCounters {
        return this.bots.reduce(
            (sum, bot) => ({
                columns: sum.columns + bot.columnCount,
                columnPackets: sum.columnPackets + bot.columnPackets,
                sections: sum.sections + bot.sections,
                bytesReceived: sum.bytesReceived + bot.bytesReceived
            }),
            { columns: 0, columnPackets: 0, sections: 0, bytesReceived: 0 }
        );
    }

    /** How many bots have logged in, whether or not they are still connected. */
    public joinedCount(): number {
        return this.bots.filter((bot) => bot.joined).length;
    }

    /** Every chunk radius the server granted any bot, in ascending order. */
    public grantedRadius(): number[] {
        return [...new Set(this.bots.flatMap((bot) => [...bot.grantedRadius]))].sort((left, right) => left - right);
    }

    /** Each bot the server disconnected before the harness did, with the reason. */
    public disconnects(): string[] {
        return this.bots.flatMap((bot) =>
            bot.disconnectReason === null ? [] : [`${bot.name}: ${bot.disconnectReason}`]
        );
    }

    /** How many bots logged in and are still connected. */
    public connectedCount(): number {
        return this.bots.filter((bot) => bot.joined && bot.disconnectReason === null).length;
    }

    /** Starts a new step: every bot's count of new columns starts again from zero. */
    public markStep(): void {
        for (const bot of this.bots) bot.markStep();
    }

    /**
     * Waits until the bots' views have settled: no terrain for `quietMs`, no sub chunk request
     * unanswered, and every connected bot given a new column since the step began, or `graceMs`
     * passed without one. A server that sends nothing new after a teleport still ends the step.
     * @returns `{ timedOut }`, true when `timeoutMs` ran out before the views settled.
     */
    public async settle({ quietMs, graceMs, timeoutMs }: { quietMs: number; graceMs: number; timeoutMs: number }) {
        const startedAt = performance.now();
        for (;;) {
            const now = performance.now();
            const live = this.bots.filter((bot) => bot.joined && bot.disconnectReason === null);
            const lastTerrain = Math.max(0, ...live.map((bot) => bot.lastTerrainAt));
            const answered = live.every((bot) => bot.pendingRequests === 0);
            const moved = live.every((bot) => bot.columnsSinceMark > 0) || now - startedAt >= graceMs;
            if (answered && moved && now - Math.max(lastTerrain, startedAt) >= quietMs) return { timedOut: false };
            if (now - startedAt >= timeoutMs) return { timedOut: true };
            await sleep(100);
        }
    }

    /** Disconnects every bot. Safe to call more than once. */
    public disconnect(): void {
        if (this.stopped) return;
        this.stopped = true;
        for (const bot of this.bots) {
            bot.leaving = true;
            bot.bot.disconnect('benchmark finished');
        }
    }
}
