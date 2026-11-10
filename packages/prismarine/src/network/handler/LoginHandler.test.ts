import type { Logger } from '@jsprismarine/logger';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import type { InetAddress } from '@jsprismarine/raknet';
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import Codec2193 from '../codec/Codec2193';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import type BanManager from '../../ban/BanManager';
import type { Config } from '../../config/Config';
import type { PermissionManager } from '../../permission/PermissionManager';
import { stub } from '../../testing/stub.test.helper';
import { plainCapabilities } from '../../testing/manualTransport.test.helper';
import type { ChunkScheduler } from '../../world/ChunkScheduler';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import type ClientConnection from '../ClientConnection';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import LoginPacket from '@jsprismarine/protocol/packet/LoginPacket';
import { PlayStatus, PlayStatusPacket } from '@jsprismarine/protocol';
import ResourcePacksInfoPacket from '@jsprismarine/protocol/packet/ResourcePacksInfoPacket';
import ServerToClientHandshakePacket from '@jsprismarine/protocol/packet/ServerToClientHandshakePacket';
import type { EncryptionCodec } from '@jsprismarine/protocol';
import type ClientToServerHandshakePacket from '@jsprismarine/protocol/packet/ClientToServerHandshakePacket';
import ClientToServerHandshakeHandler from './ClientToServerHandshakeHandler';
import LoginHandler from './LoginHandler';
import { TOKEN_ISSUER, useLoginKeys } from '../LoginVerifier';
import { testContent } from '../../testing/entityServer';
import { fakeLevel } from '../../testing/level';

/** A well-formed client identity; every real login carries one. */
const IDENTITY = 'd1b3f8a24c5e4f6a9b7c8d9e0f1a2b3c';

const jwt = (claims: Record<string, unknown>): string =>
    `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

/** The client data a login carries, before it is signed or framed. */
const clientDataOf = (displayName: string, identity: string | null = null): Record<string, unknown> => {
    const clientData: Record<string, unknown> = {
        DeviceId: '00000000-0000-0000-0000-000000000000',
        DeviceOS: 7,
        DeviceModel: 'test',
        CurrentInputMode: 1,
        GuiScale: 0,
        ThirdPartyName: displayName,
        ServerAddress: 'localhost',
        LanguageCode: 'en_US',
        ClientRandomId: 1,
        SkinId: 'test',
        SkinData: '',
        SkinImageWidth: 0,
        SkinImageHeight: 0,
        SkinResourcePatch: '',
        SkinGeometryData: '',
        SkinAnimationData: '',
        SkinColor: '#0',
        ArmSize: 'wide',
        PlayFabId: '',
        AnimatedImageData: [],
        CapeId: '',
        CapeData: '',
        CapeImageWidth: 0,
        CapeImageHeight: 0,
        PremiumSkin: false,
        PersonaSkin: false,
        CapeOnClassicSkin: false,
        PersonaPieces: [],
        PieceTintColors: []
    };

    if (identity !== null) clientData.SelfSignedId = identity;
    return clientData;
};

const loginPacket = (
    displayName = 'runner',
    identity: string | null = IDENTITY,
    protocolVersion = Codec2193.protocolVersion,
    cpk?: string
): LoginPacket =>
    new LoginPacket({
        protocolVersion,
        chainData: JSON.stringify({ chain: cpk === undefined ? [] : [jwt({ identityPublicKey: cpk })] }),
        clientData: jwt(clientDataOf(displayName, identity))
    });

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            let onlineMode = false;
            let findPlayer: (...args: unknown[]) => Player | null = () => null;

            // `createConnectedPlayer` enables the session, which is what puts it in the
            // chunk rotation - the constructor no longer does it.
            const chunkScheduler = (): ChunkScheduler => stub<ChunkScheduler>({ add: () => {}, remove: () => {} });

            // A refusal says what it refused, so a handler that turns one down logs.
            const logger = (): Logger => stub<Logger>({ debug: () => {}, verbose: () => {}, warn: () => {} });

            const sessionManager = (): SessionManager =>
                stub<SessionManager>({
                    getAllPlayers: () => [],
                    findPlayer: (...args: unknown[]) => findPlayer(...args),
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
                    // The login reads the player's record through the world's level: see
                    // `lastPlayerRecord`.
                    getLevel: () => fakeLevel({ server }),
                    // Announcing a move is the world's job now, not the entity's.
                    broadcastMove: async () => {},
                    getPlayerData: async () => ({ position: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, headYaw: 0 } })
                });

            const config = (): Config =>
                stub<Config>({
                    getOnlineMode: () => onlineMode,
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
                codec: Codec2193,
                getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
                sendDataPacket: async () => {},
                attachPlayerSession: vi.fn(),
                closePlayerSession: async () => {},
                disconnect: async () => {}
            });

            it('handle with non-banned', async () => {
                const pk = loginPacket();

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
                const pk = loginPacket();

                const sent: string[] = [];
                const quiet = stub<ClientConnection>({
                    codec: Codec2193,
                    getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
                    sendDataPacket: async (packet) => void sent.push(packet.constructor.name),
                    attachPlayerSession: vi.fn(),
                    closePlayerSession: async () => {},
                    disconnect: async () => {}
                });

                await new LoginHandler().handle(pk, server, quiet);

                expect(sent).toEqual(['PlayStatusPacket', 'ResourcePacksInfoPacket']);
            });

            describe('online mode', () => {
                const issuer = generateKeyPairSync('rsa', { modulusLength: 2048 });
                const account = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
                const accountKey = account.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
                const segment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

                const signedToken = (claims: Record<string, unknown> = {}): string => {
                    const head = segment({ alg: 'RS256', kid: 'k' });
                    const body = segment({
                        iss: TOKEN_ISSUER,
                        exp: Date.now() / 1000 + 3600,
                        xid: '2535400000000001',
                        xname: 'Steve',
                        cpk: accountKey,
                        ...claims
                    });
                    const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), issuer.privateKey);
                    return `${head}.${body}.${signature.toString('base64url')}`;
                };

                const signedLogin = (request: Record<string, unknown>): LoginPacket => {
                    const head = segment({ alg: 'ES384', x5u: accountKey });
                    const body = segment(clientDataOf('Steve'));
                    const signature = sign('sha384', Buffer.from(`${head}.${body}`), {
                        key: account.privateKey,
                        dsaEncoding: 'ieee-p1363'
                    });
                    return new LoginPacket({
                        protocolVersion: Codec2193.protocolVersion,
                        chainData: JSON.stringify(request),
                        clientData: `${head}.${body}.${signature.toString('base64url')}`
                    });
                };

                const quiet = () => {
                    const disconnects: Array<[string, DisconnectReason | undefined]> = [];
                    const stubbed = stub<ClientConnection>({
                        codec: Codec2193,
                        getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
                        phase: 'login',
                        resumeLogin: null,
                        transportCapabilities: plainCapabilities,
                        sendDataPacket: async () => {},
                        startEncryption: () => {},
                        attachPlayerSession: vi.fn(),
                        closePlayerSession: async () => {},
                        disconnect: async (reason, _hide, code) => void disconnects.push([reason ?? '', code])
                    });
                    return { connection: stubbed, disconnects };
                };

                const kicked: string[] = [];
                const existing = stub<Player>({
                    kick: async (reason) => void kicked.push(reason ?? '')
                });
                const chainClaiming = (xuid: string, name: string) => ({
                    chain: [
                        `${segment({})}.${segment({ extraData: { XUID: xuid, identity: 'x', displayName: name } })}.sig`
                    ]
                });

                const restore: Array<() => void> = [];
                const arrange = () => {
                    onlineMode = true;
                    kicked.length = 0;
                    findPlayer = () => existing;
                    restore.push(useLoginKeys({ keyFor: async (kid) => (kid === 'k' ? issuer.publicKey : undefined) }));
                };
                afterEach(() => {
                    onlineMode = false;
                    findPlayer = () => null;
                    for (const undo of restore.splice(0)) undo();
                });

                it('lets a verified account in and then replaces its other session', async () => {
                    arrange();
                    const { connection: held, disconnects } = quiet();

                    await new LoginHandler().handle(
                        signedLogin({ AuthenticationType: 0, Token: signedToken() }),
                        server,
                        held
                    );
                    // The account is verified, so the handshake is under way; the other session is
                    // still connected until the client answers it.
                    expect(kicked).toEqual([]);
                    await held.resumeLogin?.();

                    expect(disconnects).toEqual([]);
                    expect(held.attachPlayerSession).toHaveBeenCalledOnce();
                    expect(kicked).toEqual(['Logged in from another location']);
                });

                it('takes the account from the token, not from the claims the client wrote', async () => {
                    arrange();
                    const queries: unknown[] = [];
                    findPlayer = (query) => {
                        queries.push(query);
                        return null;
                    };
                    const { connection: held } = quiet();

                    await new LoginHandler().handle(
                        signedLogin({ AuthenticationType: 0, Token: signedToken(), ...chainClaiming('999', 'Notch') }),
                        server,
                        held
                    );
                    await held.resumeLogin?.();

                    expect(queries).toEqual([{ name: 'Steve', xuid: '2535400000000001' }]);
                });

                it('refuses a forged token and leaves the named account connected', async () => {
                    arrange();
                    const { connection: held, disconnects } = quiet();
                    const [head, , signature] = signedToken().split('.');
                    const claims = {
                        iss: TOKEN_ISSUER,
                        exp: Date.now() / 1000 + 3600,
                        xid: '2535400000000001',
                        xname: 'Steve',
                        cpk: accountKey,
                        forged: true
                    };

                    await new LoginHandler().handle(
                        signedLogin({ AuthenticationType: 0, Token: `${head}.${segment(claims)}.${signature}` }),
                        server,
                        held
                    );

                    expect(disconnects.map(([, code]) => code)).toEqual([DisconnectReason.NOT_AUTHENTICATED]);
                    expect(kicked).toEqual([]);
                    expect(held.attachPlayerSession).not.toHaveBeenCalled();
                });

                it('refuses a self-signed login and a claimed XUID with no token', async () => {
                    arrange();

                    for (const request of [
                        { AuthenticationType: 2 },
                        { AuthenticationType: 0, ...chainClaiming('2535400000000001', 'Steve') }
                    ]) {
                        const { connection: held, disconnects } = quiet();
                        await new LoginHandler().handle(signedLogin(request), server, held);

                        expect(disconnects.map(([, code]) => code)).toEqual([DisconnectReason.NOT_AUTHENTICATED]);
                        expect(held.attachPlayerSession).not.toHaveBeenCalled();
                    }
                    expect(kicked).toEqual([]);
                });

                it('does not verify anything when online mode is off', async () => {
                    arrange();
                    onlineMode = false;
                    const { connection: held, disconnects } = quiet();

                    await new LoginHandler().handle(loginPacket(), server, held);

                    expect(disconnects).toEqual([]);
                    expect(held.attachPlayerSession).toHaveBeenCalledOnce();
                });
            });

            describe('encryption handshake', () => {
                const identityKey = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
                    .publicKey.export({ type: 'spki', format: 'der' })
                    .toString('base64');

                const encrypting = (transportEncrypts = false) => {
                    const sent: string[] = [];
                    const started: EncryptionCodec[] = [];
                    const stubbed = stub<ClientConnection>({
                        codec: Codec2193,
                        phase: 'login',
                        resumeLogin: null,
                        transportCapabilities: { ...plainCapabilities, encrypted: transportEncrypts },
                        getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
                        sendDataPacket: async (packet) => void sent.push(packet.constructor.name),
                        startEncryption: (codec) => void started.push(codec),
                        attachPlayerSession: vi.fn(),
                        closePlayerSession: async () => {},
                        disconnect: vi.fn(async () => {})
                    });
                    return { connection: stubbed, sent, started };
                };

                it('answers a login that names an identity key with ServerToClientHandshake and waits', async () => {
                    const { connection: held, sent, started } = encrypting();

                    await new LoginHandler().handle(
                        loginPacket('runner', IDENTITY, undefined, identityKey),
                        server,
                        held
                    );

                    expect(sent).toEqual([ServerToClientHandshakePacket.name]);
                    expect(started).toHaveLength(1);
                    expect(held.phase).toBe('encryption');
                    expect(held.attachPlayerSession).not.toHaveBeenCalled();
                });

                it('sends the handshake but leaves encryption off when the transport encrypts the wire', async () => {
                    // Bedrock Dedicated Server over NetherNet: the handshake, then batches in the clear.
                    const { connection: held, sent, started } = encrypting(true);

                    await new LoginHandler().handle(
                        loginPacket('runner', IDENTITY, undefined, identityKey),
                        server,
                        held
                    );

                    expect(sent).toEqual([ServerToClientHandshakePacket.name]);
                    expect(started).toHaveLength(0);
                    expect(held.phase).toBe('encryption');
                    expect(held.attachPlayerSession).not.toHaveBeenCalled();
                });

                it('finishes the login when the client answers the handshake', async () => {
                    const { connection: held, sent } = encrypting();
                    await new LoginHandler().handle(
                        loginPacket('runner', IDENTITY, undefined, identityKey),
                        server,
                        held
                    );

                    await new ClientToServerHandshakeHandler().handle(
                        stub<ClientToServerHandshakePacket>({}),
                        server,
                        held
                    );

                    expect(held.attachPlayerSession).toHaveBeenCalledOnce();
                    expect(sent).toEqual([
                        ServerToClientHandshakePacket.name,
                        'PlayStatusPacket',
                        'ResourcePacksInfoPacket'
                    ]);
                    expect(held.resumeLogin).toBeNull();
                });

                it('refuses a login whose identity key is not usable', async () => {
                    const { connection: held, sent, started } = encrypting();

                    await new LoginHandler().handle(
                        loginPacket('runner', IDENTITY, undefined, 'bm90IGEga2V5'),
                        server,
                        held
                    );

                    expect(sent).toEqual([]);
                    expect(started).toEqual([]);
                    expect(held.disconnect).toHaveBeenCalledWith(
                        'Invalid identity!',
                        false,
                        DisconnectReason.INVALID_PLAYER
                    );
                });
            });

            it('sends the ResourcePacksInfo a server with no packs sends', async () => {
                // No packs are configurable yet, so the packet is the fixed one a Bedrock
                // Dedicated Server sends for a world with no packs and no template: every
                // flag off, an all-zero template uuid with an empty version, and a zero count.
                const pk = loginPacket();

                const sent: NetworkPacket[] = [];
                const quiet = stub<ClientConnection>({
                    codec: Codec2193,
                    getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
                    sendDataPacket: async (packet) => void sent.push(packet),
                    attachPlayerSession: vi.fn(),
                    closePlayerSession: async () => {},
                    disconnect: async () => {}
                });

                await new LoginHandler().handle(pk, server, quiet);

                const info = sent.find((packet) => packet instanceof ResourcePacksInfoPacket);
                assert(info instanceof ResourcePacksInfoPacket);
                expect(info.getPacketData()).toEqual({
                    resourcePackRequired: false,
                    hasAddonPacks: false,
                    hasScripts: false,
                    forceDisableVibrantVisuals: false,
                    worldTemplate: { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' },
                    packs: []
                });
            });

            /** A login the server lets past the identity checks and then refuses for who it is. */
            const refused = async (overrides: Partial<Server>, pk: LoginPacket) => {
                const disconnect = vi.fn();
                const rejected = stub<ClientConnection>({
                    codec: Codec2193,
                    getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
                    disconnect,
                    attachPlayerSession: vi.fn()
                });

                await new LoginHandler().handle(pk, stub<Server>({ ...server, ...overrides }), rejected);

                expect(rejected.attachPlayerSession).not.toHaveBeenCalled();
                return disconnect;
            };

            const login = () => {
                return loginPacket();
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
                    'Please sign in to Xbox Live to join.',
                    false,
                    DisconnectReason.NOT_AUTHENTICATED
                );
            });

            it('refuses a login carrying no username', async () => {
                const pk = loginPacket('', IDENTITY);

                const disconnect = vi.fn();
                const rejected = stub<ClientConnection>({ codec: Codec2193, disconnect });
                await new LoginHandler().handle(pk, server, rejected);

                expect(disconnect).toHaveBeenCalledWith('Invalid username!', false, DisconnectReason.INVALID_PLAYER);
            });

            it('refuses a login carrying no identity', async () => {
                // It used to be let through on a randomly generated uuid, which meant a
                // player in the list under an id the client itself did not know.
                const pk = loginPacket('runner', null);

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
                const pk = loginPacket('runner', IDENTITY, Codec2193.protocolVersion - 10);

                const sent: NetworkPacket[] = [];
                const disconnect = vi.fn();
                const connection = stub<ClientConnection>({
                    codec: Codec2193,
                    sendDataPacket: async (packet) => void sent.push(packet),
                    disconnect
                });
                await new LoginHandler().handle(pk, server, connection);

                const [status] = sent;
                assert(status instanceof PlayStatusPacket);
                expect(status.getPacketData()?.status).toBe(PlayStatus.LoginFailed_ClientOld);
                expect(sent).toHaveLength(1);
                expect(disconnect).toHaveBeenCalledWith(
                    `Outdated client! Please use ${Codec2193.minecraftVersions.at(-1)}`,
                    false,
                    DisconnectReason.OUTDATED_CLIENT
                );
            });

            it('refuses a login once the server is full', async () => {
                const pk = loginPacket('late', '11111111-2222-3333-4444-555555555555');

                const sent: NetworkPacket[] = [];
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
                expect(status.getPacketData()?.status).toBe(PlayStatus.LoginFailed_ServerFullSubClient);
                expect(disconnect).toHaveBeenCalledWith('Server is full!', false, DisconnectReason.SERVER_FULL);
                expect(connection.attachPlayerSession).not.toHaveBeenCalled();
            });

            /** The status the client renders as "outdated server", then a disconnect with `OutdatedServer`. */
            it('answers a newer client with LoginFailed_ServerOld, then hangs up', async () => {
                const pk = loginPacket('runner', IDENTITY, Codec2193.protocolVersion + 10);

                const sent: NetworkPacket[] = [];
                const disconnect = vi.fn();
                const connection = stub<ClientConnection>({
                    codec: Codec2193,
                    sendDataPacket: async (packet) => void sent.push(packet),
                    disconnect
                });
                await new LoginHandler().handle(pk, server, connection);

                const [status] = sent;
                assert(status instanceof PlayStatusPacket);
                expect(status.getPacketData()?.status).toBe(PlayStatus.LoginFailed_ServerOld);
                expect(sent).toHaveLength(1);
                expect(disconnect).toHaveBeenCalledWith('Outdated server!', false, DisconnectReason.OUTDATED_SERVER);
            });
        });
    });
});
