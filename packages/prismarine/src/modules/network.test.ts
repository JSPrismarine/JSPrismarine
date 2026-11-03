import { describe, expect, it } from 'vitest';

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
