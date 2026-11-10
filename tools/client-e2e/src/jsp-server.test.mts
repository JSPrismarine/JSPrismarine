import dgram from 'node:dgram';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import {
    answersRakNetPing,
    RAKNET_UNCONNECTED_PING,
    RAKNET_UNCONNECTED_PONG,
    reserveFreeUdpPort,
    udp6PortFree
} from './jsp-server.mts';

/**
 * RakNet's ids, loaded at run time: the enum that holds them is syntax this package's compiler
 * settings refuse, so the compiler must not follow the import, and the path is not a literal.
 */
const messageIdentifiersPath = '../../../packages/raknet/src/protocol/MessageIdentifiers.ts';
/** The RakNet package's entry, loaded the same way for the same reason. */
const rakNetPath = '../../../packages/raknet/src/index.ts';

/** The slice of the RakNet package the probe test drives. */
interface RakNetModule {
    ServerName: new (
        server: { getConfig(): { getMotd(): string; getGamemode(): string; getMaxPlayers(): number } },
        protocol: { protocolVersion: number; minecraftVersions: string[] }
    ) => unknown;
    RakNetListener: new (
        maxConnections: number,
        onlineMode: boolean,
        serverName: unknown,
        logger: Record<string, () => void>
    ) => {
        start(address: string, port: number): void;
        once(event: 'listening', listener: (port: number) => void): void;
        kill(): void;
    };
}

describe('jsp-server', () => {
    it('pings with the ids RakNet defines', async () => {
        const { MessageIdentifiers }: { MessageIdentifiers: Record<string, number> } = await import(
            messageIdentifiersPath
        );

        expect(RAKNET_UNCONNECTED_PING).toBe(MessageIdentifiers.UNCONNECTED_PING);
        expect(RAKNET_UNCONNECTED_PONG).toBe(MessageIdentifiers.UNCONNECTED_PONG);
    });

    it('hears a RakNet listener answer the ping', async () => {
        const { RakNetListener, ServerName }: RakNetModule = await import(rakNetPath);
        const quiet = () => {};
        const logger = { info: quiet, warn: quiet, error: quiet, verbose: quiet, debug: quiet, silly: quiet };
        const name = new ServerName(
            { getConfig: () => ({ getMotd: () => 'e2e', getGamemode: () => 'survival', getMaxPlayers: () => 1 }) },
            { protocolVersion: 2225, minecraftVersions: ['1.26.60'] }
        );
        const listener = new RakNetListener(1, false, name, logger);
        const listening = new Promise<number>((resolve) => listener.once('listening', resolve));
        listener.start('127.0.0.1', 0);
        try {
            expect(await answersRakNetPing(await listening)).toBe(true);
        } finally {
            listener.kill();
        }
    });

    it('hears nothing from a port that does not speak RakNet', async () => {
        const silent = dgram.createSocket('udp4');
        silent.bind(0, '127.0.0.1');
        await once(silent, 'listening');
        try {
            expect(await answersRakNetPing(silent.address().port)).toBe(false);
        } finally {
            silent.close();
        }
    });

    it('never reserves one port twice', async () => {
        // Each server takes two ports, its game port and `server-portv6`, so two side by side
        // must get four.
        const ports = await Promise.all([
            reserveFreeUdpPort(),
            reserveFreeUdpPort(),
            reserveFreeUdpPort(),
            reserveFreeUdpPort()
        ]);

        expect(new Set(ports).size).toBe(ports.length);
    });

    it('sees a port another socket holds on IPv6 as taken', async () => {
        const holder = dgram.createSocket({ type: 'udp6', ipv6Only: true });
        holder.bind(0, '::');
        await once(holder, 'listening');
        const { port } = holder.address();
        try {
            expect(await udp6PortFree(port)).toBe(false);
        } finally {
            holder.close();
        }
        await once(holder, 'close');
        expect(await udp6PortFree(port)).toBe(true);
    });
});
