import { DisconnectReason } from '@jsprismarine/minecraft';
import Codec2193 from '@jsprismarine/prismarine/network/codec/Codec2193';
import Codec2225 from '@jsprismarine/prismarine/network/codec/Codec2225';
import { latestCodec, registeredCodecs } from '@jsprismarine/prismarine/network/codec/CodecRegistry';
import { describeSupportedProtocols } from '@jsprismarine/prismarine/network/codec/describeCodecs';
import HandshakeCodec from '@jsprismarine/prismarine/network/codec/HandshakeCodec';
import type { ProtocolCodec } from '@jsprismarine/prismarine/network/codec/ProtocolCodec';
import RequestNetworkSettingsHandler from '@jsprismarine/prismarine/network/handler/RequestNetworkSettingsHandler';
import type DataPacket from '@jsprismarine/prismarine/network/packet/DataPacket';
import LevelChunkPacket from '@jsprismarine/prismarine/network/packet/LevelChunkPacket';
import NetworkSettingsPacket from '@jsprismarine/prismarine/network/packet/NetworkSettingsPacket';
import PlayStatusPacket from '@jsprismarine/prismarine/network/packet/PlayStatusPacket';
import PlayerListPacket, {
    PlayerListAction,
    PlayerListEntry
} from '@jsprismarine/prismarine/network/packet/PlayerListPacket';
import Skin from '@jsprismarine/prismarine/utils/skin/Skin';
import UUID from '@jsprismarine/prismarine/utils/UUID';
import RequestNetworkSettingsPacket from '@jsprismarine/prismarine/network/packet/RequestNetworkSettingsPacket';
import PlayStatus from '@jsprismarine/prismarine/network/type/PlayStatus';
import { stub } from '@jsprismarine/prismarine/testing/stub.test.helper';
import { describe, expect, it } from 'vitest';

import type ClientConnection from '@jsprismarine/prismarine/network/ClientConnection';
import type Server from '@jsprismarine/prismarine/Server';

import { FAMILIES } from './families.ts';

/**
 * The multi-version negotiation surface: a client's first packet names a protocol version,
 * and the registry either assigns that version's codec or refuses with the right sidedness.
 * The fixtures are real wire bytes - each request is encoded by the packet class and decoded
 * back through the handshake codec, the codec every connection starts on - and the handler
 * under test is the production `RequestNetworkSettingsHandler` against the real registry.
 */

/** The announced version, as a connection would first see it: encoded, then decoded. */
const requestOnTheWire = (protocolVersion: number): RequestNetworkSettingsPacket => {
    const outbound = new RequestNetworkSettingsPacket();
    outbound.protocolVersion = protocolVersion;
    outbound.encode();

    const netId = HandshakeCodec.netIdOf('RequestNetworkSettingsPacket');
    expect(netId).toBeDefined();
    const inbound = HandshakeCodec.createPacket(netId!, outbound.getBuffer());
    expect(inbound).toBeInstanceOf(RequestNetworkSettingsPacket);
    if (!(inbound instanceof RequestNetworkSettingsPacket)) throw new Error('asserted instanceof above');
    inbound.decode();
    return inbound;
};

/** A connection double that records what was sent and how the handler hung up. */
const connectionRecorder = () => {
    const sent: DataPacket[] = [];
    const hangups: Array<{ message: string; reason: number }> = [];

    const connection = stub<ClientConnection>({
        hasCompression: false,
        sendDataPacket: async (packet) => void sent.push(packet),
        disconnect: async (reason = '', _hideReason = true, code = DisconnectReason.DISCONNECTED) =>
            void hangups.push({ message: reason, reason: code })
    });
    return { sent, hangups, connection };
};

/** A player list entry's skin, with the PlayFab id whose home the two versions disagree on. */
const listSkin = () =>
    Skin.fromJWT({
        SkinId: 'classic-skin',
        CapeId: '',
        SkinResourcePatch: '',
        PlayFabId: 'PFID-abc123',
        SkinImageHeight: 1,
        SkinImageWidth: 1,
        SkinGeometryData: '',
        SkinAnimationData: '',
        CapeImageHeight: 0,
        CapeImageWidth: 0,
        CapeOnClassicSkin: false,
        SkinData: Buffer.from([0, 0, 0, 255]).toString('base64'),
        CapeData: '',
        PremiumSkin: false,
        PersonaSkin: false,
        SkinColor: '#0',
        ArmSize: 'wide',
        AnimatedImageData: [],
        PersonaPieces: [],
        PieceTintColors: []
    });

const server = stub<Server>({ getLogger: () => stub<ReturnType<Server['getLogger']>>({ info: () => {} }) });

const negotiate = async (protocolVersion: number) => {
    const recorder = connectionRecorder();
    await new RequestNetworkSettingsHandler().handle(requestOnTheWire(protocolVersion), server, recorder.connection);
    return recorder;
};

describe(FAMILIES.protocolNegotiation, () => {
    const supported: Array<[number, ProtocolCodec]> = [
        [2193, Codec2193],
        [2225, Codec2225]
    ];

    it.each(supported)(
        'a protocol %i client negotiates its own codec and gets the network settings',
        async (protocolVersion, codec) => {
            const { sent, hangups, connection } = await negotiate(protocolVersion);

            expect(connection.codec).toBe(codec);
            expect(connection.codec.protocolVersion).toBe(protocolVersion);
            expect(connection.phase).toBe('login');
            expect(sent).toHaveLength(1);
            expect(sent[0]).toBeInstanceOf(NetworkSettingsPacket);
            expect(hangups).toHaveLength(0);
        }
    );

    it('the two sessions decode the same wire id into their own packet classes', () => {
        // The negotiated codec is what makes the versions differ afterwards: the same
        // LevelChunk id builds the same class on both sessions, stamped with each session's
        // protocol, and the stamp picks the layout - 2225's is the one with the trailing
        // Is Client Biome Update boolean.
        const id2193 = Codec2193.netIdOf('LevelChunkPacket')!;
        const id2225 = Codec2225.netIdOf('LevelChunkPacket')!;
        expect(id2225).toBe(id2193);

        const of2193 = Codec2193.createPacket(id2193)!;
        const of2225 = Codec2225.createPacket(id2225)!;
        expect(of2193.getName()).toBe('LevelChunkPacket');
        expect(of2225.getName()).toBe('LevelChunkPacket');
        expect(of2225.constructor).toBe(of2193.constructor);
        expect(of2193.codecProtocol).toBe(2193);
        expect(of2225.codecProtocol).toBe(2225);
    });

    it('outbound, each codec prepares a base-class packet as its own layout', () => {
        // Gameplay code builds one class per packet; the negotiated codec stamps its
        // protocol on the instance and the layout walker does the rest - so a 1.26.60
        // client is never handed 2193 bytes.
        const chunk = () => {
            const outbound = new LevelChunkPacket();
            outbound.chunkX = 4;
            outbound.chunkZ = -3;
            outbound.subChunkCount = 2;
            outbound.data = Buffer.from([1, 2, 3]);
            return outbound;
        };

        const encodeFor = (codec: ProtocolCodec): Buffer => {
            const prepared = codec.prepareOutbound(chunk());
            expect(prepared.codecProtocol).toBe(codec.protocolVersion);
            prepared.encodePayload();
            return prepared.getBuffer();
        };

        const bytes2193 = encodeFor(Codec2193);
        const bytes2225 = encodeFor(Codec2225);

        // The 2225 layout is the 2193 one plus the trailing Is Client Biome Update boolean.
        expect(bytes2225).toStrictEqual(Buffer.concat([bytes2193, Buffer.from([0])]));

        // Preparing is idempotent: the stamp is the whole per-send cost.
        const prepared = Codec2225.prepareOutbound(chunk());
        expect(Codec2225.prepareOutbound(prepared)).toBe(prepared);
    });

    it('the player list a session receives matches the layout its own version reads', () => {
        // The join burst sends `PlayerList` before the client spawns, so a session handed the
        // wrong layout here never finishes joining. At 2225 the PlayFab id sits on the entry
        // rather than inside the skin, which is a different number of strings ahead of the
        // fixed-width `Build Platform` field - so each version's bytes are unreadable to the
        // other, and `prepareOutbound` is what keeps a session on its own side of that.
        const built = () => {
            const packet = new PlayerListPacket();
            packet.type = PlayerListAction.TYPE_ADD;
            packet.entries = [
                new PlayerListEntry({
                    uuid: UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'),
                    runtimeId: 11n,
                    name: 'Joiner',
                    xuid: '2535',
                    skin: listSkin()
                })
            ];
            return packet;
        };

        const encodeFor = (codec: ProtocolCodec): Buffer => {
            const prepared = codec.prepareOutbound(built());
            prepared.setNetId(codec.netIdOf('PlayerListPacket')!);
            prepared.encode();
            return prepared.getBuffer();
        };

        const bytes2193 = encodeFor(Codec2193);
        const bytes2225 = encodeFor(Codec2225);
        expect(bytes2225.equals(bytes2193)).toBe(false);

        /** Whether a codec's reader consumes the whole packet, as a real client must. */
        const reads = (codec: ProtocolCodec, bytes: Buffer): boolean => {
            const packet = codec.createPacket(codec.netIdOf('PlayerListPacket')!, bytes)!;
            try {
                packet.decode();
            } catch {
                return false;
            }
            return packet.feof();
        };

        expect(reads(Codec2193, bytes2193)).toBe(true);
        expect(reads(Codec2225, bytes2225)).toBe(true);
        expect(reads(Codec2225, bytes2193)).toBe(false);
        expect(reads(Codec2193, bytes2225)).toBe(false);
    });

    it('an older unsupported client is told it is outdated, status before the hangup', async () => {
        const { sent, hangups, connection } = await negotiate(800);

        expect(connection.codec).toBeUndefined();
        expect(sent).toHaveLength(1);
        expect(sent[0]).toBeInstanceOf(PlayStatusPacket);
        expect(sent[0]).toMatchObject({ status: PlayStatus.LoginFailed_ClientOld });
        expect(hangups).toHaveLength(1);
        expect(hangups[0]!.reason).toBe(DisconnectReason.OUTDATED_CLIENT);
        // The refusal names the newest version the registry speaks, which is what the
        // player should upgrade to.
        expect(hangups[0]!.message).toContain(latestCodec.minecraftVersions.at(-1)!);
    });

    it('a newer unsupported client is told the server is outdated', async () => {
        const { sent, hangups } = await negotiate(latestCodec.protocolVersion + 1);

        expect(sent[0]).toMatchObject({ status: PlayStatus.LoginFailed_ServerOld });
        expect(hangups).toHaveLength(1);
        expect(hangups[0]!.reason).toBe(DisconnectReason.OUTDATED_SERVER);
    });

    it('the versions the server reports are exactly the ones a client can negotiate', async () => {
        const described = describeSupportedProtocols().join('\n');

        for (const codec of registeredCodecs) {
            const { connection } = await negotiate(codec.protocolVersion);

            expect(connection.codec).toBe(codec);
            expect(described).toContain(`protocol §e${codec.protocolVersion}§r`);
            for (const version of codec.minecraftVersions) expect(described).toContain(`§e${version}§r`);
        }
    });
});
