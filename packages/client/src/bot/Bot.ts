import { OfflineAuthProvider } from '@jsprismarine/auth';
import Client from '../Client';
import { playerAuthInput } from '../playerAuthInput';
import { MovePlayerPacket, PositionMode, RequestChunkRadiusPacket } from '@jsprismarine/protocol';

import type { Identity } from '@jsprismarine/auth';
import type { Logger } from '@jsprismarine/logger';
import type { NetworkPacket } from '@jsprismarine/protocol';
import type { ITransport } from '../net/ITransport';
import type Random from './Random';
import type { Walk } from '../playerAuthInput';
import type { Behavior } from './behavior/Behavior';

/** The server's own rate, and therefore the rate a client's input is meaningful at. */
export const TICK_INTERVAL_MS = 50;

export interface BotOptions {
    readonly host: string;
    readonly port: number;
    /** Which transport to dial; RakNet by default. */
    readonly network?: 'raknet' | 'nethernet';
    readonly displayName: string;
    readonly behaviors: readonly Behavior[];
    readonly random: Random;
    readonly logger: Logger;
    readonly viewDistance: number;
    readonly loginTimeoutMs?: number;
    /** A transport to use in place of dialing `host` and `port`, such as an in-process one. */
    readonly transport?: ITransport;
}

/**
 * One synthetic player: a client, a position it believes in, and the behaviors driving it.
 *
 * The position is the bot's own rather than the client's because the client core has no game
 * state layer yet. It starts where `StartGame` puts it and moves when the server moves it, and
 * otherwise only where its behaviors walk it. For load generation that is enough and honestly
 * so: a bot walks through walls, and the numbers it produces are still real, because the
 * server does the same work either way.
 *
 * It moves as a client of a supported protocol does, with one `PlayerAuthInputPacket` per tick
 * it has something to report. `MovePlayerPacket` is client-bound only since protocol 818, and
 * the server drops one a client sends.
 */
export default class Bot {
    public position = { x: 0, y: 0, z: 0 };
    public pitch = 0;
    public yaw = 0;
    public headYaw = 0;
    public runtimeEntityId = 0n;
    public identity: Identity = { xuid: '', identity: '', displayName: '' };

    private readonly client: Client;
    private ticker: NodeJS.Timeout | undefined;
    private ticks = 0;
    private stopped = false;
    /** Whether the next input says the bot applied a teleport the server sent it. */
    private handledTeleport = false;

    /** Counted per action name, merged into the fleet report. */
    public readonly actions: Map<string, number> = new Map();

    /** From the first packet sent to standing in the world, in milliseconds. */
    public loginLatencyMs: number | null = null;
    public failure: string | null = null;

    public constructor(private readonly options: BotOptions) {
        this.client = new Client({
            host: options.host,
            port: options.port,
            network: options.network,
            transport: options.transport,
            logger: options.logger,
            auth: new OfflineAuthProvider({ displayName: options.displayName }),
            loginTimeoutMs: options.loginTimeoutMs
        });

        // A teleport or a respawn reset is the server moving this player. A real client takes
        // the new pose and says so with `HandledTeleport` in its next input; until it does,
        // the server ignores the positions it reports (`holdsMovementForTeleport`), and a bot
        // that went on from where it was would be moved back there once the hold timed out.
        this.client.getSession().registerHandler(MovePlayerPacket, {
            phases: ['login', 'play'],
            handle: (move) => {
                if (move.runtimeEntityId !== this.runtimeEntityId) return;
                if (move.mode !== PositionMode.Teleport && move.mode !== PositionMode.Respawn) return;

                this.position = { ...move.position };
                this.pitch = move.pitch;
                this.yaw = move.yaw;
                this.headYaw = move.headYaw;
                this.handledTeleport = true;
            }
        });
    }

    public getClient(): Client {
        return this.client;
    }

    public isConnected(): boolean {
        return this.client.isConnected();
    }

    /** Connects and logs in, recording how long it took. Throws with the reason if it fails. */
    public async connect(): Promise<void> {
        const startedAt = performance.now();

        try {
            const startGame = await this.client.connect();

            this.loginLatencyMs = performance.now() - startedAt;
            this.runtimeEntityId = startGame.runtimeEntityId;
            this.position = { ...startGame.position };
            this.identity = await this.client.getIdentity();
        } catch (error: unknown) {
            this.failure = error instanceof Error ? error.message : String(error);
            throw error;
        }

        // The single most important dial for a load test: view distance is quadratic in the
        // chunks a server generates, holds and sends, so a fleet that never asks for a small
        // one measures terrain generation rather than whatever it meant to.
        await this.send(
            new RequestChunkRadiusPacket({ radius: this.options.viewDistance, maxRadius: this.options.viewDistance })
        );
    }

    /** Starts ticking the behaviors. Idempotent. */
    public start(): void {
        if (this.ticker !== undefined || this.stopped) return;

        this.ticker = setInterval(() => {
            void this.tick();
        }, TICK_INTERVAL_MS);
        this.ticker.unref();
    }

    public stop(): void {
        this.stopped = true;
        clearInterval(this.ticker);
        this.ticker = undefined;
    }

    public disconnect(reason = 'bot finished'): void {
        this.stop();
        this.client.disconnect(reason);
    }

    /**
     * Runs one tick of every behavior, then sends the tick's input if a behavior asked for one.
     *
     * {@link Bot.start} calls it every {@link TICK_INTERVAL_MS}; a test that steps the server
     * itself can call it in step. Behaviors run in sequence rather than concurrently, and
     * whatever they do to the pose goes out in one input, as a real client's tick does.
     */
    public async tick(): Promise<void> {
        if (this.stopped || !this.client.isConnected()) return;

        let input: { walk: Walk | undefined } | undefined;
        const context = {
            bot: this,
            random: this.options.random,
            tick: this.ticks,
            send: (packet: NetworkPacket<any>) => this.send(packet),
            input: (walk?: Walk) => {
                input = { walk: walk ?? input?.walk };
            },
            record: (action: string) => this.actions.set(action, (this.actions.get(action) ?? 0) + 1)
        };

        for (const behavior of this.options.behaviors) {
            try {
                await behavior.tick(context);
            } catch (error: unknown) {
                // A behavior that throws must not take the connection out of the fleet:
                // losing a bot silently changes what is being measured.
                this.options.logger.debug(
                    `Behavior ${behavior.name} failed for ${this.options.displayName}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        if (input !== undefined) {
            // Once, on the first input after the teleport: from here the bot reports from the
            // target, and the server takes its positions again. Taken before the send waits, so
            // a teleport that arrives meanwhile flags the input after this one.
            const handledTeleport = this.handledTeleport;
            this.handledTeleport = false;
            try {
                await this.send(playerAuthInput(this, { tick: BigInt(this.ticks), walk: input.walk, handledTeleport }));
            } catch (error: unknown) {
                this.options.logger.debug(
                    `Input failed for ${this.options.displayName}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        this.ticks++;
    }

    private async send(packet: NetworkPacket<any>): Promise<void> {
        await this.client.getSession().send(packet);
    }
}
