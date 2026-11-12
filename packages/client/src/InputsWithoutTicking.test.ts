import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { Server } from '@jsprismarine/prismarine';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import { SetLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Client from './Client';
import type { DecodedPacket } from './net/ClientPacketRegistry';
import { LoopbackNetwork } from './testing/loopback.test.helper';

const MAX_JOIN_TICKS = 120;

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
}, 60_000);

/**
 * A server started with ticking disabled, which nothing steps by hand, applies a client's inputs
 * when they arrive, as it admits chunk completions. It used to hold them for an input step no
 * tick ever ran, so the join stopped at its first input and a closed connection left its player
 * in the world until shutdown.
 *
 * The join cannot reach `PlayStatus(PlayerSpawn)` here: chunks go out from the tick's chunk
 * phase, and no tick runs. The test sends `SetLocalPlayerAsInitialized` itself, which is the
 * input that puts the player into its world.
 *
 * A harness that steps the ticks by hand turns the chunk completion queue on, and its inputs
 * still wait for the input step of the next tick it runs.
 */
/** A server with ticking disabled and one client over a loopback transport, the client not yet connected. */
const start = async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-inputs-without-ticking-'));
    vi.stubEnv('JSP_DIR', stateRoot);
    writeFileSync(
        path.join(stateRoot, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            'preload-radius': 0,
            'view-distance': 2,
            'enable-ticking': false,
            'chunk-workers': 0,
            'enable-query': false,
            worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '1' } }
        })
    );

    const network = new LoopbackNetwork();
    const server = new Server({
        logger: new Logger('error'),
        config: new Config(),
        headless: true,
        transport: network.transport
    });
    const client = new Client({
        host: '127.0.0.1',
        transport: network.client(),
        auth: new OfflineAuthProvider({
            displayName: 'Untimed',
            identity: '00000000-0000-4000-8000-000000510301'
        }),
        logger: new Logger('error'),
        loginTimeoutMs: 600_000
    });
    cleanup = async () => {
        client.disconnect();
        await server.shutdown({ stayAlive: true });
        rmSync(stateRoot, { recursive: true, force: true });
    };

    const received: string[] = [];
    client.getSession().on('packet', (packet: DecodedPacket) => void received.push(packet.name));
    const connections = () => network.connectionIds().flatMap((id) => server.getSessionManager().get(id) ?? []);
    const quiet = (): boolean =>
        server.getKernel().get(networkToken).isInboundSettled() &&
        client.getSession().isIdle() &&
        connections().every((connection) => connection.isOutboundSettled());
    // A fixed point, not a delay: every frame each side sent has been handled or is held.
    const settle = async (): Promise<void> => {
        for (;;) {
            await client.getSession().settled();
            await Promise.all(connections().map((connection) => connection.settleOutbound()));
            await nextTurn();
            if (quiet()) {
                await nextTurn();
                if (quiet()) return;
            }
        }
    };

    await server.bootstrap('127.0.0.1', 0);
    return { server, client, received, settle };
};

describe('a server without a tick loop', () => {
    it('applies a join and a disconnect without a tick', async () => {
        const { server, client, received, settle } = await start();
        // Settles only on `PlayerSpawn`, which needs a tick; see the description above.
        client.connect().catch(() => {});
        await settle();

        // The resource pack responses are inputs, and the second one starts the game.
        expect(received).toContain('StartGamePacket');
        const [session] = server.getSessionManager().getSessions();
        if (session === undefined) throw new Error('The client has no player session');
        const world = session.getWorld();
        expect(world.getActor(session.runtimeId)).toBeNull();

        await client.getSession().send(new SetLocalPlayerAsInitializedPacket({ runtimeEntityId: session.runtimeId }));
        await settle();
        expect(world.viewerOf(session.runtimeId)).toBe(session);

        client.disconnect();
        await settle();
        expect(server.getSessionManager().getSessions()).toEqual([]);
        expect(world.getActor(session.runtimeId)).toBeNull();
        expect(world.viewerOf(session.runtimeId)).toBeUndefined();

        // All of it without a tick.
        expect(server.getTick()).toBe(0);
    }, 600_000);

    it('holds the inputs for the input step of a tick a harness steps by hand', async () => {
        const { server, client, received, settle } = await start();
        // What a stepping harness does after the bootstrap, as the tick loop does when it starts.
        server.getChunkCompletionQueue().activate();
        client.connect().catch(() => {});
        await settle();

        // The login's spawn chunk is a completion the input step admits, so the pack list takes ticks.
        for (let ticks = 0; !received.includes('ResourcePacksInfoPacket'); ticks++) {
            if (ticks > MAX_JOIN_TICKS) throw new Error(`No pack list within ${MAX_JOIN_TICKS} ticks`);
            server.advanceTick();
            await settle();
        }

        // The client's answer to the pack list is an input, held for the next tick.
        expect(received).not.toContain('ResourcePackStackPacket');
        server.advanceTick();
        await settle();
        expect(received).toContain('ResourcePackStackPacket');
    }, 600_000);
});
