import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The full test run reuses workers without isolating modules. Another server test can leave
// its mocked RakNet listener in the worker, so this integration suite must reload the real one.
vi.hoisted(() => {
    vi.doUnmock('@jsprismarine/raknet');
    vi.resetModules();
});

import Client from './Client';

/**
 * The whole of phase one, proved the only way it can be: a real server booted in this
 * process, and the real client logging into it over a real socket.
 *
 * Nothing is mocked. The point is not that each piece works - the unit tests cover that -
 * but that the pieces agree: the batch codec with the server's `BatchPacket`, the migrated
 * packets with the ones they mirror, and the chain this client signs with the one the
 * server's `LoginPacket` and `Skin.fromJWT` expect to parse.
 */

let stateRoot: string;
let server: Server | null = null;
let port = 0;
const clients: Client[] = [];

beforeAll(async () => {
    // Pointed at a temp directory so the run writes no world, config or log into the repo.
    // LevelDB takes a directory lock, so a world of our own is not optional either.
    stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-client-login-'));
    vi.stubEnv('JSP_DIR', stateRoot);
    writeFileSync(
        path.join(stateRoot, 'config.json'),
        JSON.stringify({ 'online-mode': false, worlds: { world: { generator: 'Flat' } } })
    );

    const logger = new Logger('error');
    server = new Server({ logger, config: new Config(), headless: true });

    // Port 0 would be ideal, but the server binds through RakNet and never reports back
    // what it got, so a fixed uncommon one it is.
    port = 19277;
    await server.bootstrap('127.0.0.1', port);
}, 60_000);

afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect());
});

afterAll(async () => {
    server?.getRaknet()?.kill();
    vi.unstubAllEnvs();
    rmSync(stateRoot, { recursive: true, force: true });
}, 30_000);

const newClient = (displayName: string) => {
    const client = new Client({
        host: '127.0.0.1',
        port,
        logger: new Logger('error'),
        auth: new OfflineAuthProvider({ displayName }),
        loginTimeoutMs: 25_000
    });

    clients.push(client);
    return client;
};

describe('logging into a real server', () => {
    it('completes the handshake and spawns', async () => {
        const client = newClient('LoginTester');

        const startGame = await client.connect();

        // The server assigns these, so their presence is proof the whole chain worked:
        // compression negotiated, chain accepted, resource packs agreed, StartGame decoded.
        expect(startGame.runtimeEntityId).toBeGreaterThan(0n);
        expect(startGame.entityId).toBeGreaterThan(0n);
        expect(Number.isFinite(startGame.position.y)).toBe(true);
        expect(client.isConnected()).toBe(true);
    }, 40_000);

    it('is visible to the server as a joined player', async () => {
        const client = newClient('VisibleTester');
        await client.connect();

        const players = server!.getSessionManager().getAllPlayers();
        expect(players.map((player: any) => player.getName())).toContain('VisibleTester');
    }, 40_000);

    it('carries the identity the auth provider signed', async () => {
        const client = newClient('IdentityTester');
        const identity = await client.getIdentity();
        await client.connect();

        const player = server!
            .getSessionManager()
            .getAllPlayers()
            .find((candidate: any) => candidate.getName() === 'IdentityTester');

        expect(player).toBeDefined();
        // The uuid the client signed into its own chain is the one the server knows it by.
        // A login with no identity used to be handed a freshly generated uuid instead, which
        // is exactly the bug this asserts against.
        expect(player!.getUUID().toString()).toBe(identity.identity);
        // Offline, so no XUID - and the server accepted that because it is not in online mode.
        expect(identity.xuid).toBe('');
    }, 40_000);

    it('lets two clients in at once, under their own identities', async () => {
        const [first, second] = [newClient('FirstTester'), newClient('SecondTester')];

        const [a, b] = await Promise.all([first.connect(), second.connect()]);

        expect(a.runtimeEntityId).not.toBe(b.runtimeEntityId);

        const names = server!
            .getSessionManager()
            .getAllPlayers()
            .map((player: any) => player.getName());
        expect(names).toEqual(expect.arrayContaining(['FirstTester', 'SecondTester']));
    }, 40_000);

    it('reports what it received but has no codec for', async () => {
        const client = newClient('CoverageTester');
        await client.connect();

        // Not an assertion about which packets are missing - that changes as the protocol
        // gets implemented - but that the registry notices rather than silently dropping
        // them. A join sends crafting data, biome definitions and much else this client has
        // no use for yet.
        expect(client.getRegistry().getUnknownIds().length).toBeGreaterThan(0);
    }, 40_000);

    it('drops the connection of a kicked player rather than leaving it holding a slot', async () => {
        const client = newClient('KickTester');
        await client.connect();

        const closed = new Promise<string>((resolve) => client.once('disconnect', resolve));

        const player = server!
            .getSessionManager()
            .getAllPlayers()
            .find((candidate: any) => candidate.getName() === 'KickTester');
        expect(player).toBeDefined();

        const before = server!.getRaknet()!.getSessions().length;
        await player!.kick('kicked by the test');

        // A kick used to stop at the `DisconnectPacket` and trust the client to hang up.
        // A vanilla client does; this one does not - after the login sequence nothing is
        // subscribed to that packet - and it goes on pinging, so the session never timed
        // out either. The connection stayed on the server for the life of the process.
        await expect(closed).resolves.toBeDefined();

        // Not immediate: the session lingers until the client acknowledges the goodbye.
        await vi.waitFor(() => expect(server!.getRaknet()!.getSessions().length).toBeLessThan(before), {
            timeout: 5_000
        });
        expect(
            server!
                .getSessionManager()
                .getAllPlayers()
                .map((candidate: any) => candidate.getName())
        ).not.toContain('KickTester');
    }, 40_000);

    it('frees the address the instant RakNet forgets a session, not after the tear-down', async () => {
        const client = newClient('RaceTester');
        await client.connect();

        const player = server!
            .getSessionManager()
            .getAllPlayers()
            .find((candidate: any) => candidate.getName() === 'RaceTester');
        const address = player!.getNetworkSession().getConnection().getRakNetSession().getAddress();
        const token = address.toToken();
        expect(server!.getSessionManager().has(token)).toBe(true);

        // What RakNet does the moment it drops a session, and what the `openConnection` of a
        // client reconnecting from the same port races against. The tear-down that follows
        // is asynchronous; releasing the token has to happen before any of it, or the
        // reconnection is refused as "already connected" and then torn down in its place.
        server!.getRaknet()!.emit('closeConnection', address, 'test');

        // Synchronously: not after a microtask, not after the player has finished saving.
        expect(server!.getSessionManager().has(token)).toBe(false);
    }, 40_000);

    it('places a new player the way a Bedrock Dedicated Server does', async () => {
        const client = newClient('PlacedTester');
        const respawns: Array<{ x: number; y: number; z: number; state: number; runtimeId: number }> = [];
        client.getSession().on('raw', ({ id, buffer }: { id: number; buffer: Buffer }) => {
            if (id !== 0x2d) return;
            // Respawn: three little endian floats, the state byte, then the runtime id varint.
            respawns.push({
                x: buffer.readFloatLE(1),
                y: buffer.readFloatLE(5),
                z: buffer.readFloatLE(9),
                state: buffer[13]!,
                runtimeId: buffer[14]!
            });
        });

        const startGame = await client.connect();
        const spawn = await server!.getWorldManager().getDefaultWorld().getSpawnPosition();
        const requested = { x: spawn.getX() + 0.5, y: spawn.getY() + 1, z: spawn.getZ() + 0.5 };

        // StartGame says where the spawn point asked for: the block center, one block above the
        // stored height, at eye level.
        expect(startGame.position.x).toBeCloseTo(requested.x);
        expect(startGame.position.y).toBeCloseTo(requested.y + 1.62, 4);
        expect(startGame.position.z).toBeCloseTo(requested.z);

        // Searching at the eyes, searching at the feet, then ready: three distinct packets with
        // runtime id 0, which is what BDS 1.26.52 sends.
        expect(respawns.map(({ state }) => state)).toEqual([0, 0, 1]);
        expect(respawns.map(({ runtimeId }) => runtimeId)).toEqual([0, 0, 0]);
        expect(respawns[0]!.y).toBeCloseTo(requested.y + 1.62, 4);
        expect(respawns[1]!.y).toBeCloseTo(requested.y, 4);

        const player = server!
            .getSessionManager()
            .getAllPlayers()
            .find((candidate: any) => candidate.getName() === 'PlacedTester');
        const ready = respawns[2]!;
        // The server keeps the player where the ready packet said.
        expect(player!.getPosition().getX()).toBeCloseTo(ready.x);
        expect(player!.getPosition().getY()).toBeCloseTo(ready.y, 4);
        expect(player!.getPosition().getZ()).toBeCloseTo(ready.z);
    }, 40_000);

    it('refuses a protocol version the server does not speak', async () => {
        const client = newClient('VersionTester');

        // Rewritten on the way out rather than parameterised: the version is deliberately not
        // an option on Client, because a client that can be pointed at the wrong one is a
        // client that will be.
        const session = client.getSession();
        const original = session.sendImmediate.bind(session);
        vi.spyOn(session, 'sendImmediate').mockImplementation(async (packet: any) => {
            const data = packet.getPacketData?.();
            if (data && 'protocolVersion' in data) data.protocolVersion = 1;
            return original(packet);
        });

        await expect(client.connect()).rejects.toThrow(/out of date|refused|Disconnected/i);
    }, 40_000);
});
