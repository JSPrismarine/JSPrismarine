import { DisconnectReason, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import {
    DisconnectPacket,
    LoginPacket,
    NetworkBinaryStream,
    NetworkSettingsPacket,
    PlayStatus,
    PlayStatusPacket,
    RequestNetworkSettingsPacket,
    ResourcePackClientResponsePacket,
    ResourcePackStackPacket,
    ResourcePackStatus,
    ResourcePacksInfoPacket
} from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import ServerDisconnectPacket from './packet/DisconnectPacket';
import ServerLoginPacket from './packet/LoginPacket';
import ServerNetworkSettingsPacket, { CompressionThreshold } from './packet/NetworkSettingsPacket';
import ServerPlayStatusPacket from './packet/PlayStatusPacket';
import ServerRequestNetworkSettingsPacket from './packet/RequestNetworkSettingsPacket';
import ServerResourcePackClientResponsePacket from './packet/ResourcePackClientResponsePacket';
import ServerResourcePackStackPacket from './packet/ResourcePackStackPacket';
import ServerResourcePacksInfoPacket from './packet/ResourcePacksInfoPacket';
import ServerPlayStatus from './type/PlayStatus';
import ResourcePackStatusType from './type/ResourcePackStatusType';

import type DataPacket from './packet/DataPacket';
import type { NetworkPacket } from '@jsprismarine/protocol';

/**
 * The packets of a join up to the first chunk, pinned across the two codecs that implement them.
 *
 * Everything named here lives twice: once in the server's `DataPacket` tree and once in
 * `@jsprismarine/protocol`, which the bot client speaks. Both describe protocol 2193, so a
 * disagreement is a bug in one of them that nothing else would catch - the server's own client
 * would simply mis-read the server in the same shape the server mis-wrote it.
 *
 * Each case encodes with one side and decodes with the other, and asserts the reader consumed
 * the whole buffer. A round trip through a single codec proves nothing about the layout; a
 * reader that stops short leaves the next packet of a batch starting mid-field.
 */

/** Encodes with the protocol package. */
const clientBytes = (packet: NetworkPacket<unknown>): Buffer => packet.serialize(new NetworkBinaryStream());

/** Encodes with the server package. */
const serverBytes = (packet: DataPacket): Buffer => {
    packet.encode();
    return packet.getBuffer();
};

/** Decodes with the protocol package, asserting nothing is left over. */
const readAsClient = <T>(packet: NetworkPacket<T>, buffer: Buffer): T => {
    const stream = new NetworkBinaryStream(buffer);
    const data = packet.deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

/** Decodes with the server package, asserting nothing is left over. */
const readAsServer = <T extends DataPacket>(packet: T, buffer: Buffer): T => {
    packet.setReadBuffer(buffer);
    packet.decode();
    expect(packet.feof()).toBe(true);
    return packet;
};

describe('login sequence interop', () => {
    describe('RequestNetworkSettings', () => {
        it('agrees byte for byte and both sides read the whole packet', () => {
            const server = new ServerRequestNetworkSettingsPacket();
            server.protocolVersion = 2193;
            const bytes = serverBytes(server);

            expect(clientBytes(new RequestNetworkSettingsPacket({ protocolVersion: 2193 }))).toEqual(bytes);
            expect(readAsClient(new RequestNetworkSettingsPacket(), bytes).protocolVersion).toBe(2193);
            expect(readAsServer(new ServerRequestNetworkSettingsPacket(), bytes).protocolVersion).toBe(2193);
        });
    });

    describe('NetworkSettings', () => {
        const data = {
            compressionThreshold: CompressionThreshold.COMPRESS_EVERYTHING,
            compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
            clientThrottlingEnabled: false,
            clientThrottleThreshold: 0,
            clientThrottleScalar: 0
        };

        it('agrees byte for byte and the client reads the whole packet', () => {
            const server = new ServerNetworkSettingsPacket();
            Object.assign(server, data);
            const bytes = serverBytes(server);

            expect(clientBytes(new NetworkSettingsPacket(data))).toEqual(bytes);
            expect(readAsClient(new NetworkSettingsPacket(), bytes)).toEqual(data);
        });

        it('carries CompressionAlgorithm None through both codecs', () => {
            // 0xffff, which only survives because the field is two bytes wide on both sides.
            const none = { ...data, compressionAlgorithm: PacketCompressionAlgorithm.NONE };
            const bytes = clientBytes(new NetworkSettingsPacket(none));

            expect(readAsServer(new ServerNetworkSettingsPacket(), bytes).compressionAlgorithm).toBe(
                PacketCompressionAlgorithm.NONE
            );
        });
    });

    describe('Login', () => {
        const data = { protocolVersion: 2193, chainData: '{"chain":[]}', clientData: 'a.b.c' };

        it('agrees byte for byte on the connection request framing', () => {
            const server = new ServerLoginPacket();
            server.protocol = data.protocolVersion;
            server.chainData = data.chainData;
            server.clientData = data.clientData;

            expect(clientBytes(new LoginPacket(data))).toEqual(serverBytes(server));
        });

        it('lets the client read what the server wrote', () => {
            const server = new ServerLoginPacket();
            server.protocol = data.protocolVersion;
            server.chainData = data.chainData;
            server.clientData = data.clientData;

            expect(readAsClient(new LoginPacket(), serverBytes(server))).toEqual(data);
        });
    });

    describe('PlayStatus', () => {
        it('agrees byte for byte and both sides read the whole packet', () => {
            const server = new ServerPlayStatusPacket();
            server.status = ServerPlayStatus.PlayerSpawn;
            const bytes = serverBytes(server);

            expect(clientBytes(new PlayStatusPacket({ status: PlayStatus.PlayerSpawn }))).toEqual(bytes);
            expect(readAsClient(new PlayStatusPacket(), bytes).status).toBe(PlayStatus.PlayerSpawn);
            expect(readAsServer(new ServerPlayStatusPacket(), bytes).status).toBe(ServerPlayStatus.PlayerSpawn);
        });
    });

    describe('Disconnect', () => {
        it('agrees byte for byte when the messages are present', () => {
            const server = new ServerDisconnectPacket();
            server.reason = DisconnectReason.KICKED;
            server.skipMessage = false;
            server.message = 'Bye';
            server.filteredMessage = '';
            const bytes = serverBytes(server);

            expect(
                clientBytes(
                    new DisconnectPacket({
                        reason: DisconnectReason.KICKED,
                        skipMessage: false,
                        message: 'Bye',
                        filteredMessage: ''
                    })
                )
            ).toEqual(bytes);
            expect(readAsClient(new DisconnectPacket(), bytes)).toEqual({
                reason: DisconnectReason.KICKED,
                skipMessage: false,
                message: 'Bye',
                filteredMessage: ''
            });
        });

        it('agrees that selector 1 ends the packet', () => {
            const bytes = clientBytes(new DisconnectPacket({ reason: DisconnectReason.SHUTDOWN, skipMessage: true }));
            const server = readAsServer(new ServerDisconnectPacket(), bytes);

            expect(server.reason).toBe(DisconnectReason.SHUTDOWN);
            expect(server.skipMessage).toBe(true);
        });
    });

    describe('ResourcePacksInfo', () => {
        const worldTemplate = { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' };
        const pack = {
            id: {
                uuidMostSignificant: 0x0123456789abcdefn,
                uuidLeastSignificant: 0xfedcba9876543210n,
                version: '1.2.3'
            },
            contentKey: 'key',
            subPackName: 'sub',
            contentIdentity: 'identity',
            hasScripts: true,
            isAddonPack: false,
            isRayTracingCapable: true,
            cdnUrl: 'https://example.invalid/pack.zip'
        };

        it('agrees byte for byte on an empty pack list', () => {
            const server = new ServerResourcePacksInfoPacket();
            server.resourcePackRequired = false;
            server.hasAddonPacks = false;
            server.hasScripts = false;

            expect(
                clientBytes(
                    new ResourcePacksInfoPacket({
                        resourcePackRequired: false,
                        hasAddonPacks: false,
                        hasScripts: false,
                        forceDisableVibrantVisuals: false,
                        worldTemplate,
                        packs: []
                    })
                )
            ).toEqual(serverBytes(server));
        });

        it('agrees byte for byte on a pack entry, uuid halves included', () => {
            const server = new ServerResourcePacksInfoPacket();
            server.resourcePackRequired = true;
            server.hasAddonPacks = false;
            server.hasScripts = true;
            server.forceDisableVibrantVisuals = true;
            server.worldTemplate = worldTemplate;
            server.resourcePackEntries = [{ ...pack, sizeBytes: 4096n }];
            const bytes = serverBytes(server);

            expect(
                clientBytes(
                    new ResourcePacksInfoPacket({
                        resourcePackRequired: true,
                        hasAddonPacks: false,
                        hasScripts: true,
                        forceDisableVibrantVisuals: true,
                        worldTemplate,
                        packs: [{ ...pack, sizeBytes: 4096n }]
                    })
                )
            ).toEqual(bytes);

            const decoded = readAsServer(new ServerResourcePacksInfoPacket(), bytes);
            expect(decoded.resourcePackEntries).toEqual([{ ...pack, sizeBytes: 4096n }]);
        });
    });

    describe('ResourcePackStack', () => {
        it('agrees byte for byte, including the uint32 experiment count', () => {
            const server = new ServerResourcePackStackPacket();
            server.texturePackRequired = false;
            server.texturePackList = [{ packId: 'uuid', version: '1.0.0', subPackName: '' }];
            server.baseGameVersion = '*';
            server.experiments = [{ name: 'gametest', enabled: true }];
            server.experimentsAlreadyEnabled = true;
            server.includeEditorPacks = false;
            const bytes = serverBytes(server);

            expect(
                clientBytes(
                    new ResourcePackStackPacket({
                        texturePackRequired: false,
                        texturePacks: [{ uuid: 'uuid', version: '1.0.0', subPackName: '' }],
                        gameVersion: '*',
                        experiments: [{ name: 'gametest', enabled: true }],
                        experimentsAlreadyEnabled: true,
                        includeEditorPacks: false
                    })
                )
            ).toEqual(bytes);

            const decoded = readAsServer(new ServerResourcePackStackPacket(), bytes);
            expect(decoded.texturePackList).toEqual([{ packId: 'uuid', version: '1.0.0', subPackName: '' }]);
            expect(decoded.experiments).toEqual([{ name: 'gametest', enabled: true }]);
            expect(decoded.includeEditorPacks).toBe(false);
        });
    });

    describe('ResourcePackClientResponse', () => {
        it('reads the alternative the client sends, with no list after it', () => {
            const bytes = clientBytes(
                new ResourcePackClientResponsePacket({ status: ResourcePackStatus.Completed, packIds: [] })
            );
            const server = readAsServer(new ServerResourcePackClientResponsePacket(), bytes);

            // Alternative 3 plus the offset: the docs number the alternatives from zero and
            // `ResourcePackResponse` numbers the statuses from one.
            expect(server.status).toBe(ResourcePackStatusType.Completed);
            expect(server.packIds).toEqual([]);
        });

        it('agrees on the Downloading Packs list that only SendPacks carries', () => {
            const server = new ServerResourcePackClientResponsePacket();
            server.status = ResourcePackStatusType.SendPacks;
            server.packIds = ['pack_1.0.0'];
            const bytes = serverBytes(server);

            expect(
                clientBytes(
                    new ResourcePackClientResponsePacket({
                        status: ResourcePackStatus.SendPacks,
                        packIds: ['pack_1.0.0']
                    })
                )
            ).toEqual(bytes);
            expect(readAsClient(new ResourcePackClientResponsePacket(), bytes)).toEqual({
                status: ResourcePackStatus.SendPacks,
                packIds: ['pack_1.0.0']
            });
        });
    });
});
