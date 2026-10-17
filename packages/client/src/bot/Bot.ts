import { OfflineAuthProvider } from '@jsprismarine/auth';
import Client from '../Client';
import { RequestChunkRadiusPacket } from '@jsprismarine/protocol';

import type { Identity } from '@jsprismarine/auth';
import type { Logger } from '@jsprismarine/logger';
import type { NetworkPacket } from '@jsprismarine/protocol';
import type Random from './Random';
import type { Behaviour } from './behaviour/Behaviour';

/** The server's own rate, and therefore the rate a client's input is meaningful at. */
export const TICK_INTERVAL_MS = 50;

export interface BotOptions {
    readonly host: string;
    readonly port: number;
    readonly displayName: string;
    readonly behaviours: readonly Behaviour[];
    readonly random: Random;
    readonly logger: Logger;
    readonly viewDistance: number;
    readonly loginTimeoutMs?: number;
}

/**
 * One synthetic player: a client, a position it believes in, and the behaviours driving it.
 *
 * The position is the bot's own rather than the client's because the client core has no game
 * state layer yet - it knows where it started, from `StartGame`, and nothing after that. For
 * load generation that is enough and honestly so: a bot walks through walls, and the numbers
 * it produces are still real, because the server does the same work either way.
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

    /** Counted per action name, merged into the fleet report. */
    public readonly actions: Map<string, number> = new Map();

    /** From the first packet sent to standing in the world, in milliseconds. */
    public loginLatencyMs: number | null = null;
    public failure: string | null = null;

    public constructor(private readonly options: BotOptions) {
        this.client = new Client({
            host: options.host,
            port: options.port,
            logger: options.logger,
            auth: new OfflineAuthProvider({ displayName: options.displayName }),
            loginTimeoutMs: options.loginTimeoutMs
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

    /** Starts ticking the behaviours. Idempotent. */
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
     * Runs one tick of every behaviour.
     *
     * Behaviours run in sequence rather than concurrently: two of them sending a move in the
     * same tick would have the server apply whichever framed first, and a bot that
     * teleported between two positions every tick is not a player.
     */
    private async tick(): Promise<void> {
        if (this.stopped || !this.client.isConnected()) return;

        const context = {
            bot: this,
            random: this.options.random,
            tick: this.ticks,
            send: (packet: NetworkPacket<any>) => this.send(packet),
            record: (action: string) => this.actions.set(action, (this.actions.get(action) ?? 0) + 1)
        };

        for (const behaviour of this.options.behaviours) {
            try {
                await behaviour.tick(context);
            } catch (error: unknown) {
                // A behaviour that throws must not take the connection out of the fleet:
                // losing a bot silently changes what is being measured.
                this.options.logger.debug(
                    `Behaviour ${behaviour.name} failed for ${this.options.displayName}: ${
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
