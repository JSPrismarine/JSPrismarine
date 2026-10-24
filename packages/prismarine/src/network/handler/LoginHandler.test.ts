import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import type BanManager from '../../ban/BanManager';
import type { Config } from '../../config/Config';
import type { PermissionManager } from '../../permission/PermissionManager';
import { stub } from '../../testing/stub.test.helper';
import type { ChunkScheduler } from '../../world/ChunkScheduler';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import LoginPacket from '../packet/LoginPacket';
import LoginHandler from './LoginHandler';

/** A well-formed client identity; every real login carries one. */
const IDENTITY = 'd1b3f8a24c5e4f6a9b7c8d9e0f1a2b3c';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            // `createConnectedPlayer` enables the session, which is what puts it in the
            // chunk rotation - the constructor no longer does it.
            const chunkScheduler = (): ChunkScheduler => stub<ChunkScheduler>({ add: () => {}, remove: () => {} });

            // A refusal says what it refused, so a handler that turns one down logs.
            const logger = (): Logger => stub<Logger>({ debug: () => {}, verbose: () => {}, warn: () => {} });

            const sessionManager = (): SessionManager =>
                stub<SessionManager>({
                    getAllPlayers: () => [],
                    findPlayer: () => null,
                    getPlayerByExactName: () => null
                });

            const world = (): World =>
                stub<World>({
                    addEntity: async () => {},
                    getPlayers: () => [],
                    // The handler resolves where the player starts before building one,
                    // now that an entity has to be given somewhere to be.
                    getSpawnPosition: async () => new Vector3(0, 64, 0),
                    getName: () => 'test-world',
                    getServer: () => server,
                    // Announcing a move is the world's job now, not the entity's.
                    broadcastMove: async () => {},
                    getPlayerData: async () => ({ position: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, headYaw: 0 } })
                });

            const config = (): Config =>
                stub<Config>({
                    getOnlineMode: () => false,
                    getGamemode: () => 'survival',
                    getProximityBroadcast: () => true,
                    getEntityTrackingHysteresis: () => 2,
                    getEntityTrackingInterval: () => 4
                });

            const permissionManager = (): PermissionManager =>
                stub<PermissionManager>({ getPermissions: async () => [], isOp: () => false });

            const banManager = (): BanManager => stub<BanManager>({ isBanned: () => false });

            const server: Server = stub<Server>({
                getChunkScheduler: chunkScheduler,
                getLogger: logger,
                getSessionManager: sessionManager,
                getWorldManager: () => stub<WorldManager>({ getDefaultWorld: world }),
                getConfig: config,
                getPermissionManager: permissionManager,
                getBanManager: banManager,
                getTick: () => 0,
                on: vi.fn(),
                post: vi.fn(),
                emit: async () => {}
            });

            // The session is built by `createConnectedPlayer` now, not mocked in: the
            // connection is handed the real one and only has to accept it.
            const connection: ClientConnection = stub<ClientConnection>({
                getRakNetSession: () =>
                    stub<RakNetSession>({ getAddress: () => stub<InetAddress>({ toToken: () => 'token' }) }),
                sendDataPacket: async () => {},
                attachPlayerSession: vi.fn(),
                closePlayerSession: async () => {},
                disconnect: async () => {}
            });

            it('handle with non-banned', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.identity = IDENTITY;
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);

                // The pair was joined and the connection was given the session, which is what
                // makes the client a connected player rather than a bare handshake.
                expect(connection.attachPlayerSession).toHaveBeenCalledOnce();
            });

            it('handle with banned without reason', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.identity = IDENTITY;
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle with banned with reason', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.identity = IDENTITY;
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle invalid username', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('refuses a login carrying no identity', async () => {
                // It used to be let through on a randomly generated uuid, which meant a
                // player in the list under an id the client itself did not know.
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

                const disconnect = vi.fn();
                const rejected = stub<ClientConnection>({ disconnect });
                await new LoginHandler().handle(pk, server, rejected);

                expect(disconnect).toHaveBeenCalledWith('Invalid identity!', false);
            });

            it('handle outdated client', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol - 10;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle outdated server', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol + 10;

                const connection = stub<ClientConnection>({ sendDataPacket: async () => {} });

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });
        });
    });
});
