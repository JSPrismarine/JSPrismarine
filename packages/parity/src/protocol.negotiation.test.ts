import { DisconnectReason } from '@jsprismarine/minecraft';
import Codec2193 from '@jsprismarine/prismarine/network/codec/Codec2193';
import Codec2225 from '@jsprismarine/prismarine/network/codec/Codec2225';
import { latestCodec } from '@jsprismarine/prismarine/network/codec/CodecRegistry';
import HandshakeCodec from '@jsprismarine/prismarine/network/codec/HandshakeCodec';
import type { ProtocolCodec } from '@jsprismarine/prismarine/network/codec/ProtocolCodec';
import RequestNetworkSettingsHandler from '@jsprismarine/prismarine/network/handler/RequestNetworkSettingsHandler';
import type DataPacket from '@jsprismarine/prismarine/network/packet/DataPacket';
import LevelChunkPacket from '@jsprismarine/prismarine/network/packet/LevelChunkPacket';
import NetworkSettingsPacket from '@jsprismarine/prismarine/network/packet/NetworkSettingsPacket';
import PlayStatusPacket from '@jsprismarine/prismarine/network/packet/PlayStatusPacket';
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
    inbound!.decode();
    expect(inbound).toBeInstanceOf(RequestNetworkSettingsPacket);
    return inbound as RequestNetworkSettingsPacket;
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
        // LevelChunk id builds the 2193 layout on one session and the 2225 layout - the one
        // with the trailing Is Client Biome Update boolean - on the other.
        const id2193 = Codec2193.netIdOf('LevelChunkPacket')!;
        const id2225 = Codec2225.netIdOf('LevelChunkPacket')!;
        expect(id2225).toBe(id2193);

        const of2193 = Codec2193.createPacket(id2193)!;
        const of2225 = Codec2225.createPacket(id2225)!;
        expect(of2193.getName()).toBe('LevelChunkPacket');
        expect(of2225.getName()).toBe('LevelChunkPacket');
        expect(of2225).toBeInstanceOf(of2193.constructor);
        expect(of2193).not.toBeInstanceOf(of2225.constructor);
        expect(of2225.codecProtocol).toBe(2225);
    });

    it('outbound, each codec prepares a base-class packet as its own layout', () => {
        // Gameplay code builds the base classes; the negotiated codec decides what encodes.
        // 2193 sends the instance as built, 2225 swaps in its own class - same fields,
        // 2225 wire layout - so a 1.26.60 client is never handed 2193 bytes.
        const outbound = new LevelChunkPacket();
        outbound.chunkX = 4;
        outbound.chunkZ = -3;
        outbound.subChunkCount = 2;
        outbound.data = Buffer.from([1, 2, 3]);

        expect(Codec2193.prepareOutbound(outbound)).toBe(outbound);

        const prepared = Codec2225.prepareOutbound(outbound);
        expect(prepared).not.toBe(outbound);
        expect(prepared.constructor).toBe(Codec2225.createPacket(Codec2225.netIdOf('LevelChunkPacket')!)!.constructor);
        expect(prepared.codecProtocol).toBe(2225);
        expect(prepared).toMatchObject({ chunkX: 4, chunkZ: -3, subChunkCount: 2 });

        // A packet already carrying the codec's layout passes through untouched.
        expect(Codec2225.prepareOutbound(prepared)).toBe(prepared);
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
});
