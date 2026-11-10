import dgram from 'node:dgram';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { startTestModule } from '@jsprismarine/kernel/testing';
import type { Config } from '../config/Config';
import SessionManager from '../SessionManager';
import PacketLogFilter from '../network/PacketLogFilter';
import { stub } from '../testing/stub.test.helper';
import type Server from '../Server';
import type { Networking } from './network';
import { ServerNetworking, networkModule } from './network';
import { networkToken } from './tokens';

describe('modules/network', () => {
    it('provides the networking the server constructed under the network token', async () => {
        const networking = stub<Networking>({});

        const handle = await startTestModule(networkModule(networking));
        try {
            expect(handle.get(networkToken)).toBe(networking);
        } finally {
            await handle.stop();
        }
    });

    it('survives a kernel restart without touching the listener', async () => {
        // A reload stops and restarts the kernel while the listener stays bound,
        // so the module must not start or kill anything in its own lifecycle.
        const networking = stub<Networking>({});

        const handle = await startTestModule(networkModule(networking));
        await handle.stop();
        await handle.start();
        try {
            expect(handle.get(networkToken)).toBe(networking);
        } finally {
            await handle.stop();
        }
    });

    it('has no listener and ignores a kill before start', () => {
        const networking = new ServerNetworking(stub<Server>({}));

        expect(networking.getListener()).toBeUndefined();
        expect(() => networking.kill()).not.toThrow();
    });

    it('refuses to start with every transport turned off', () => {
        const server = stub<Server>({
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getEnableRakNet: () => false,
                    getEnableNetherNet: () => false
                })
        });
        const networking = new ServerNetworking(server);

        expect(() => networking.start('127.0.0.1', 0)).toThrow('No transport is enabled');
        expect(networking.getListener()).toBeUndefined();
    });

    it('starts with NetherNet alone, advertising the same server name RakNet would', () => {
        const server = stub<Server>({
            getConfig: () =>
                stub<Config>({
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getEnableRakNet: () => false,
                    getEnableNetherNet: () => true,
                    // Off, so the test binds nothing: UDP 7551 is a fixed, shared port.
                    getEnableLanVisibility: () => false,
                    getLevelName: () => 'world'
                }),
            getLogger: () => stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} }),
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getQueryManager: () => stub<ReturnType<Server['getQueryManager']>>({}),
            getSessionManager: () => new SessionManager()
        });
        const networking = new ServerNetworking(server);
        // The server identity key is written to the data directory, so keep it out of the repository.
        const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-network-'));
        vi.stubEnv('JSP_DIR', dataDirectory);

        try {
            // Port 0: HTTP signaling binds an ephemeral TCP port, so nothing fixed is taken.
            networking.start('127.0.0.1', 0);

            expect(networking.getListener()).toBeUndefined();
            expect(networking.getServerName()?.getMotd()).toBe('test server');
            expect(fs.existsSync(path.join(dataDirectory, 'nethernet-identity.pem'))).toBe(true);
        } finally {
            networking.kill();
            vi.unstubAllEnvs();
            fs.rmSync(dataDirectory, { recursive: true, force: true });
        }
    });

    /** A server running RakNet alone, in socket mode, on the IPv6 port given. */
    const rakNetServer = (portV6: number, warn: (message: string) => void = () => {}) =>
        stub<Server>({
            getConfig: () =>
                stub<Config>({
                    getEnableQuery: () => false,
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getOnlineMode: () => false,
                    getEnableRakNet: () => true,
                    getEnableNetherNet: () => false,
                    getUseRakNetWorker: () => false,
                    getServerPortV6: () => portV6
                }),
            getLogger: () =>
                stub<Logger>({
                    debug: () => {},
                    error: () => {},
                    info: () => {},
                    silly: () => {},
                    verbose: () => {},
                    warn
                }),
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getSessionManager: () => new SessionManager()
        });

    it('listens on IPv6 beside a wildcard IPv4 bind and advertises both ports', async () => {
        const networking = new ServerNetworking(rakNetServer(0));

        try {
            // Port 0 for both: the advertised ports change from their defaults once each socket binds.
            networking.start('0.0.0.0', 0);
            const name = networking.getServerName()!;

            await vi.waitFor(() => {
                expect(name.getPort()).not.toBe(19132);
                expect(name.getPortV6()).not.toBe(19133);
            });
            expect(name.getPortV6()).not.toBe(name.getPort());
        } finally {
            networking.kill();
        }
    });

    it('keeps IPv4 running and warns when the IPv6 port is taken', async () => {
        const holder = dgram.createSocket({ type: 'udp6', ipv6Only: true });
        holder.bind(0, '::');
        await once(holder, 'listening');
        const taken = holder.address().port;
        const warnings: string[] = [];
        const networking = new ServerNetworking(rakNetServer(taken, (message) => warnings.push(message)));

        try {
            networking.start('0.0.0.0', 0);

            await vi.waitFor(() => expect(warnings).toHaveLength(1));
            expect(warnings[0]).toContain(`IPv6 clients cannot join: UDP port ${taken} is unavailable`);
            expect(networking.getListener()).toBeDefined();
        } finally {
            networking.kill();
            holder.close();
        }
    });

    it('rejects replay before the network dispatcher starts', async () => {
        const networking = new ServerNetworking(stub<Server>({}));

        await expect(
            networking.replayInboundRecord({
                connectionId: 1,
                order: 0,
                sequence: 0,
                tick: 0,
                protocolVersion: 2193,
                packetName: 'TextPacket',
                payload: Buffer.alloc(0)
            })
        ).rejects.toThrow('Cannot replay a packet before networking starts');
    });

    it('delegates replay to the started network dispatcher', async () => {
        const server = stub<Server>({
            getConfig: () =>
                stub<Config>({
                    getEnableQuery: () => false,
                    getGamemode: () => 'survival',
                    getMaxPlayers: () => 1,
                    getMotd: () => 'test server',
                    getOnlineMode: () => false,
                    getEnableRakNet: () => true,
                    getEnableNetherNet: () => false,
                    getUseRakNetWorker: () => false
                }),
            getLogger: () =>
                stub<Logger>({
                    debug: () => {},
                    error: () => {},
                    info: () => {},
                    silly: () => {},
                    verbose: () => {},
                    warn: () => {}
                }),
            getPacketHandlerRegistry: () => stub<ReturnType<Server['getPacketHandlerRegistry']>>({}),
            getPacketLogFilter: () => new PacketLogFilter(),
            getQueryManager: () => stub<ReturnType<Server['getQueryManager']>>({}),
            getSessionManager: () => new SessionManager()
        });
        const networking = new ServerNetworking(server);

        try {
            // Port 0 asks the OS for an ephemeral local port; cleanup below leaves no listener behind.
            networking.start('127.0.0.1', 0);

            await expect(
                networking.replayInboundRecord({
                    connectionId: 1,
                    order: 0,
                    sequence: 0,
                    tick: 0,
                    protocolVersion: 2193,
                    packetName: 'TextPacket',
                    payload: Buffer.alloc(0)
                })
            ).rejects.toThrow('Replay connection 1 is not connected');
        } finally {
            networking.kill();
        }
    });
});
