import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { assert, describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import Codec2193 from '../codec/Codec2193';
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
import type DataPacket from '../packet/DataPacket';
import LoginPacket from '../packet/LoginPacket';
import PlayStatusPacket from '../packet/PlayStatusPacket';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import PlayStatus from '../type/PlayStatus';
import LoginHandler from './LoginHandler';
import { testContent } from '../../testing/entityServer';

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
                    getMaxPlayers: () => 2,
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
                // No pack stack, so a restored inventory resolves no item through the content.
                getContent: () => testContent(),
                getLogger: logger,
                getSessionManager: sessionManager,
                // `getWorlds` because a login looks for the player's record in every loaded
                // world, each world keeping its own: see `lastPlayerRecord`.
                getWorldManager: () => stub<WorldManager>({ getDefaultWorld: world, getWorlds: () => [world()] }),
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
                codec: Codec2193,
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
                pk.protocol = Codec2193.protocolVersion;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);

                // The pair was joined and the connection was given the session, which is what
                // makes the client a connected player rather than a bare handshake.
                expect(connection.attachPlayerSession).toHaveBeenCalledOnce();
            });

            it('sends nothing but PlayStatus and ResourcePacksInfo during login', async () => {
                // The settings, abilities and a MovePlayer per player used to go out from
                // `Player.enable`, here, before the client had even been told it was in. A
                // retail client at 2193 drops that with `InitialConnection-90`: it is still
                // logging in and treats a game packet as malformed.
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.identity = IDENTITY;
                pk.protocol = Codec2193.protocolVersion;

                const sent: string[] = [];
                const quiet = stub<ClientConnection>({
                    codec: Codec2193,
                    getRakNetSession: () =>
                        stub<RakNetSession>({ getAddress: () => stub<InetAddress>({ toToken: () => 'token' }) }),
                    sendDataPacket: async (packet) => void sent.push(packet.constructor.name),
                    attachPlayerSession: vi.fn(),
                    closePlayerSession: async () => {},
                    disconnect: async () => {}
                });

                await new LoginHandler().handle(pk, server, quiet);

                expect(sent).toEqual(['PlayStatusPacket', 'ResourcePacksInfoPacket']);
            });

            it('sends the ResourcePacksInfo a server with no packs sends', async () => {
                // No packs are configurable yet, so the packet is the fixed one a Bedrock
                // Dedicated Server sends for a world with no packs and no template: every
                // flag off, an all-zero template uuid with an empty version, and a zero count.
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.identity = IDENTITY;
                pk.protocol = Codec2193.protocolVersion;

                const sent: DataPacket[] = [];
                const quiet = stub<ClientConnection>({
                    codec: Codec2193,
                    getRakNetSession: () =>
                        stub<RakNetSession>({ getAddress: () => stub<InetAddress>({ toToken: () => 'token' }) }),
                    sendDataPacket: async (packet) => void sent.push(packet),
                    attachPlayerSession: vi.fn(),
                    closePlayerSession: async () => {},
                    disconnect: async () => {}
                });

                await new LoginHandler().handle(pk, server, quiet);

                const info = sent.find((packet) => packet instanceof ResourcePacksInfoPacket);
                assert(info instanceof ResourcePacksInfoPacket);
                info.encode();
                expect([...info.getBuffer()]).toEqual([
                    0x06, // packet id header
                    0x00, // Resource Pack Required
                    0x00, // Has Addon Packs
                    0x00, // Has Scripts
                    0x00, // Force Disable Vibrant Visuals
                    ...Array.from({ length: 16 }, () => 0x00), // World Template Id And Version: an all-zero uuid
                    0x00, // and an empty version
                    0x00 // Resource Packs count, a varuint32
                ]);
            });

            /** A login the server lets past the identity checks and then refuses for who it is. */
            const refused = async (overrides: Partial<Server>, pk: LoginPacket) => {
                const disconnect = vi.fn();
                const rejected = stub<ClientConnection>({
                    codec: Codec2193,
                    getRakNetSession: () =>
                        stub<RakNetSession>({ getAddress: () => stub<InetAddress>({ toToken: () => 'token' }) }),
                    disconnect,
                    attachPlayerSession: vi.fn()
                });

                await new LoginHandler().handle(pk, stub<Server>({ ...server, ...overrides }), rejected);

                expect(rejected.attachPlayerSession).not.toHaveBeenCalled();
                return disconnect;
            };

            const login = () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.identity = IDENTITY;
                pk.protocol = Codec2193.protocolVersion;
                return pk;
            };

            it('refuses a banned player with NOT_ALLOWED and no reason', async () => {
                const banned = { getBanManager: () => stub<BanManager>({ isBanned: () => '' }) };

                const disconnect = await refused(banned, login());

                expect(disconnect).toHaveBeenCalledWith('You have been banned!', false, DisconnectReason.NOT_ALLOWED);
            });

            it('refuses a banned player with NOT_ALLOWED and the reason', async () => {
                const banned = { getBanManager: () => stub<BanManager>({ isBanned: () => 'griefing' }) };

                const disconnect = await refused(banned, login());

                expect(disconnect).toHaveBeenCalledWith(
                    'You have been banned for reason: griefing!',
                    false,
                    DisconnectReason.NOT_ALLOWED
                );
            });

            it('refuses a login with no XUID on a server in online mode with NOT_AUTHENTICATED', async () => {
                const online = { getConfig: () => stub<Config>({ ...config(), getOnlineMode: () => true }) };

                const disconnect = await refused(online, login());

                expect(disconnect).toHaveBeenCalledWith(
                    'Server is in online-mode!',
                    false,
                    DisconnectReason.NOT_AUTHENTICATED
                );
            });

            it('refuses a login carrying no username', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Codec2193.protocolVersion;

                const disconnect = vi.fn();
                const rejected = stub<ClientConnection>({ codec: Codec2193, disconnect });
                await new LoginHandler().handle(pk, server, rejected);

                expect(disconnect).toHaveBeenCalledWith('Invalid username!', false, DisconnectReason.INVALID_PLAYER);
            });

            it('refuses a login carrying no identity', async () => {
                // It used to be let through on a randomly generated uuid, which meant a
                // player in the list under an id the client itself did not know.
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Codec2193.protocolVersion;

                const disconnect = vi.fn();
                const rejected = stub<ClientConnection>({ codec: Codec2193, disconnect });
                await new LoginHandler().handle(pk, server, rejected);

                expect(disconnect).toHaveBeenCalledWith('Invalid identity!', false, DisconnectReason.INVALID_PLAYER);
            });

            /**
             * The status the client renders as "outdated client". Nothing else is read from the
             * packet. The docs end a failed status by terminating the connection, so a disconnect
             * with `OutdatedClient` follows; the status alone left the connection open.
             */
            it('answers an older client with LoginFailed_ClientOld, then hangs up', async () => {
                const pk = new LoginPacket();
                pk.protocol = Codec2193.protocolVersion - 10;

                const sent: DataPacket[] = [];
                const disconnect = vi.fn();
                const connection = stub<ClientConnection>({
                    codec: Codec2193,
                    sendDataPacket: async (packet) => void sent.push(packet),
                    disconnect
                });
                await new LoginHandler().handle(pk, server, connection);

                const [status] = sent;
                assert(status instanceof PlayStatusPacket);
                expect(status.status).toBe(PlayStatus.LoginFailed_ClientOld);
                expect(sent).toHaveLength(1);
                expect(disconnect).toHaveBeenCalledWith(
                    `Outdated client! Please use ${Codec2193.minecraftVersions.at(-1)}`,
                    false,
                    DisconnectReason.OUTDATED_CLIENT
                );
            });

            it('refuses a login once the server is full', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'late';
                pk.identity = '11111111-2222-3333-4444-555555555555';
                pk.protocol = Codec2193.protocolVersion;

                const sent: DataPacket[] = [];
                const fullServer = stub<Server>({
                    ...server,
                    getSessionManager: () =>
                        stub<SessionManager>({ getAllPlayers: () => [stub<Player>(), stub<Player>()] }),
                    getConfig: () => stub<Config>({ getMaxPlayers: () => 2 })
                });
                const disconnect = vi.fn();
                const connection = stub<ClientConnection>({
                    codec: Codec2193,
                    sendDataPacket: async (packet) => {
                        sent.push(packet);
                    },
                    attachPlayerSession: vi.fn(),
                    disconnect
                });

                await new LoginHandler().handle(pk, fullServer, connection);

                expect(sent).toHaveLength(1);
                const [status] = sent;
                expect(status).toBeInstanceOf(PlayStatusPacket);
                assert(status instanceof PlayStatusPacket);
                expect(status.status).toBe(PlayStatus.LoginFailed_ServerFullSubClient);
                expect(disconnect).toHaveBeenCalledWith('Server is full!', false, DisconnectReason.SERVER_FULL);
                expect(connection.attachPlayerSession).not.toHaveBeenCalled();
            });

            /** The status the client renders as "outdated server", then a disconnect with `OutdatedServer`. */
            it('answers a newer client with LoginFailed_ServerOld, then hangs up', async () => {
                const pk = new LoginPacket();
                pk.protocol = Codec2193.protocolVersion + 10;

                const sent: DataPacket[] = [];
                const disconnect = vi.fn();
                const connection = stub<ClientConnection>({
                    codec: Codec2193,
                    sendDataPacket: async (packet) => void sent.push(packet),
                    disconnect
                });
                await new LoginHandler().handle(pk, server, connection);

                const [status] = sent;
                assert(status instanceof PlayStatusPacket);
                expect(status.status).toBe(PlayStatus.LoginFailed_ServerOld);
                expect(sent).toHaveLength(1);
                expect(disconnect).toHaveBeenCalledWith('Outdated server!', false, DisconnectReason.OUTDATED_SERVER);
            });
        });
    });
});
