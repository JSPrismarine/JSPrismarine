import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import LoginPacket from '../packet/LoginPacket';
import LoginHandler from './LoginHandler';

/** A well-formed client identity; every real login carries one. */
const IDENTITY = 'd1b3f8a24c5e4f6a9b7c8d9e0f1a2b3c';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            const server: Server = {
                // `createConnectedPlayer` enables the session, which is what puts it in the
                // chunk rotation - the constructor no longer does it.
                getChunkScheduler: () => ({ add: () => {}, remove: () => {} }),
                getLogger: () => ({
                    debug: () => {},
                    verbose: () => {},
                    // A refusal says what it refused, so a handler that turns one down logs.
                    warn: () => {}
                }),
                getSessionManager: () => ({
                    getAllPlayers: () => [],
                    findPlayer: () => null,
                    getPlayerByExactName: () => null
                }),
                getWorldManager: () => ({
                    getDefaultWorld: () => ({
                        addEntity: () => {},
                        getPlayers: () => [],
                        // The handler resolves where the player starts before building one,
                        // now that an entity has to be given somewhere to be.
                        getSpawnPosition: async () => new Vector3(0, 64, 0),
                        getName: () => 'test-world',
                        getServer: () => server,
                        // Announcing a move is the world's job now, not the entity's.
                        broadcastMove: async () => {},
                        getPlayerData(_player: any) {
                            return { position: { x: 0, y: 0, z: 0 }, inventory: [] };
                        }
                    })
                }),
                getConfig: () => ({
                    getOnlineMode: () => false,
                    getGamemode: () => 'survival',
                    getProximityBroadcast: () => true,
                    getEntityTrackingHysteresis: () => 2,
                    getEntityTrackingInterval: () => 4
                }),
                getPermissionManager: () => ({
                    getPermissions(_player: any) {
                        return null;
                    },
                    isOp: (_username: string) => false
                }),
                getBanManager: () => ({
                    isBanned: (_player: any) => {
                        return false;
                    }
                }),
                getTick: () => 0,
                on: vi.fn(),
                post: vi.fn(),
                emit: vi.fn().mockResolvedValue({})
            } as any;

            // The session is built by `createConnectedPlayer` now, not mocked in: the
            // connection is handed the real one and only has to accept it.
            const connection: ClientConnection = {
                getRakNetSession: vi.fn().mockReturnValue({
                    getAddress: () => ({
                        toToken: vi.fn().mockReturnValue('token')
                    })
                }),
                sendDataPacket: vi.fn().mockResolvedValue({}),
                attachPlayerSession: vi.fn(),
                closePlayerSession: vi.fn().mockResolvedValue({}),
                disconnect: vi.fn()
            } as any;

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

                const rejected = { disconnect: vi.fn() } as any;
                await new LoginHandler().handle(pk, server, rejected);

                expect(rejected.disconnect).toHaveBeenCalledWith('Invalid identity!', false);
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

                const connection = {
                    sendDataPacket: (_packet: any) => {}
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });
        });
    });
});
