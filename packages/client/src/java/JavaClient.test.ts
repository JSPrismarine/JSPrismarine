import { JavaConnections } from '@jsprismarine/prismarine/editions/java/JavaConnections';
import { ConnectionIds } from '@jsprismarine/prismarine/network/transport/ConnectionId';
import { TcpTransport } from '@jsprismarine/prismarine/network/transport/TcpTransport';
import { offlineUuid } from '@jsprismarine/protocol/java/javaIdentity';
import { FeatureFlags } from '@jsprismarine/protocol/java/packet/configuration';
import { PlayDisconnect } from '@jsprismarine/protocol/java/packet/play';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { afterEach, describe, expect, it } from 'vitest';

import type { JavaReceived } from './JavaClient';
import { JavaClient } from './JavaClient';

const quiet = { debug: () => {}, info: () => {}, warn: () => {} };

/** A server's Java listener with no world behind it, so a join ends as it reaches play. */
const listen = async ({
    onlineMode = false,
    hasJoined
}: {
    onlineMode?: boolean;
    hasJoined?: (name: string, hash: string) => Promise<{ id: string; name: string; properties: [] } | undefined>;
} = {}) => {
    const transport = new TcpTransport(new ConnectionIds(), quiet);
    new JavaConnections(transport, {
        status: { getMotd: () => 'A JSPrismarine server', getOnlinePlayerCount: () => 3, getMaxPlayerCount: () => 20 },
        brand: 'JSPrismarine',
        onlineMode: () => onlineMode,
        compressionThreshold: () => 64,
        keepAliveIntervalMs: () => 15_000,
        enforcesSecureChat: () => false,
        ...(hasJoined === undefined ? {} : { hasJoined }),
        log: quiet
    });
    await transport.listen('127.0.0.1', 0);
    return { transport, port: transport.port()! };
};

describe('JavaClient', () => {
    let transport: TcpTransport | undefined;
    afterEach(() => transport?.close());

    it("reads a server's list entry, then its pong", async () => {
        const server = await listen();
        transport = server.transport;

        const { status } = await JavaClient.status('127.0.0.1', server.port);

        expect(status).toMatchObject({
            version: { name: NEWEST_JAVA_RELEASE.minecraftVersion, protocol: NEWEST_JAVA_RELEASE.protocolVersion },
            players: { max: 20, online: 3 },
            description: { text: 'A JSPrismarine server' }
        });
    });

    it('logs in offline, compressed, through the configuration, to the play phase', async () => {
        const server = await listen();
        transport = server.transport;
        const client = new JavaClient({ host: '127.0.0.1', port: server.port, username: 'Steve' });
        const read: JavaReceived[] = [];
        client.on('packet', (received) => read.push(received));

        // The server shows Java clients no world here, so it hangs up once the client is in play.
        await expect(client.connect()).rejects.toThrow('Disconnected by the server');

        expect(read.map(({ definition }) => definition.name)).toEqual(
            expect.arrayContaining(['Set Compression', 'Login Success', FeatureFlags.name, 'Finish Configuration'])
        );
        expect(read.at(-1)?.definition).toBe(PlayDisconnect);
        expect(read.find(({ definition }) => definition.name === 'Login Success')?.payload).toMatchObject({
            uuid: offlineUuid('Steve'),
            username: 'Steve'
        });
        expect(client.getBrand()).toBe('JSPrismarine');
    });

    it('encrypts an online-mode login, and tells the session server the hash the server checks', async () => {
        const asked: string[] = [];
        const server = await listen({
            onlineMode: true,
            hasJoined: async (name, hash) => {
                asked.push(hash);
                return { id: offlineUuid(name), name, properties: [] };
            }
        });
        transport = server.transport;
        const joined: string[] = [];
        const client = new JavaClient({
            host: '127.0.0.1',
            port: server.port,
            username: 'Notch',
            joinSession: async (hash) => {
                joined.push(hash);
            }
        });
        const read: string[] = [];
        client.on('packet', ({ definition }) => read.push(definition.name));

        await expect(client.connect()).rejects.toThrow('Disconnected by the server');

        expect(joined).toHaveLength(1);
        expect(asked).toEqual(joined);
        // Everything after the encryption request was read through the cipher.
        expect(read).toEqual(expect.arrayContaining(['Encryption Request', 'Login Success', 'Finish Configuration']));
    });

    it('refuses an online-mode login it has no session for', async () => {
        const server = await listen({ onlineMode: true });
        transport = server.transport;
        const client = new JavaClient({ host: '127.0.0.1', port: server.port, username: 'Notch' });

        await expect(client.connect()).rejects.toThrow('no session to join it with');
    });
});
