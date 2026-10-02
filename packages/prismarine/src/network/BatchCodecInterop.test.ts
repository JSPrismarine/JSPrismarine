import { BATCH_PACKET_ID, BatchCodec, UNCOMPRESSED_BATCH } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import BatchPacket from './packet/BatchPacket';
import NetworkSettingsPacket, { CompressionThreshold } from './packet/NetworkSettingsPacket';
import RequestNetworkSettingsPacket from './packet/RequestNetworkSettingsPacket';
import TextPacket from './packet/TextPacket';
import TextType from './type/TextType';

/**
 * The new codec in `@jsprismarine/protocol` and the server's own `BatchPacket` have to
 * agree on the wire, byte for byte, in both directions.
 *
 * They are not going to be swapped for one another in a single commit: the client is built
 * on the codec while the server still runs `BatchPacket`, so for as long as both exist a
 * disagreement between them is a client that cannot talk to this server. That makes this
 * the load-bearing test of the pair, not a nicety - and it is the one that would have
 * caught the prefix-byte confusion had it been written the other way round.
 */

const requestNetworkSettings = (protocolVersion: number) => {
    const packet = new RequestNetworkSettingsPacket();
    packet.protocolVersion = protocolVersion;
    packet.encode();
    return packet;
};

const networkSettings = () => {
    const packet = new NetworkSettingsPacket();
    packet.compressionThreshold = CompressionThreshold.COMPRESS_EVERYTHING;
    packet.compressionAlgorithm = PacketCompressionAlgorithm.ZLIB;
    packet.clientThrottlingEnabled = false;
    packet.clientThrottleThreshold = 0;
    packet.clientThrottleScalar = 0;
    packet.encode();
    return packet;
};

const text = (message: string) => {
    const packet = new TextPacket();
    packet.type = TextType.Raw;
    packet.needsTranslation = false;
    packet.message = message;
    packet.xuid = '';
    packet.platformChatId = '';
    packet.filtered = '';
    packet.encode();
    return packet;
};

const zlibCodec = () =>
    BatchCodec.compressed({
        algorithm: PacketCompressionAlgorithm.ZLIB,
        // BatchPacket compresses unconditionally, so match that rather than a threshold.
        threshold: 1
    });

describe('BatchCodec interop with the server BatchPacket', () => {
    it('reads a compressed batch the server encoded', async () => {
        const batch = new BatchPacket();
        batch.compressed = true;
        const packets = [requestNetworkSettings(748), text('hello')];
        packets.forEach((packet) => batch.addPacket(packet));
        batch.encode();

        const decoded = zlibCodec().decode(batch.getBuffer());

        expect(decoded).toEqual(packets.map((packet) => packet.getBuffer()));
    });

    it('writes a compressed batch the server can read', async () => {
        const packets = [requestNetworkSettings(748).getBuffer(), text('hello').getBuffer()];

        const wire = zlibCodec().encode(packets);
        const batch = new BatchPacket(wire);
        batch.compressed = true;

        expect(await batch.asyncDecode()).toEqual(packets);
    });

    it('agrees on the pre-negotiation form, where there is no algorithm byte', async () => {
        // The two packets that travel before compression is negotiated. A prefix byte here
        // would be read as part of the first packet's length varint.
        const batch = new BatchPacket();
        batch.compressed = false;
        const packets = [networkSettings()];
        packets.forEach((packet) => batch.addPacket(packet));
        batch.encode();

        const wire = batch.getBuffer();
        expect(wire[0]).toBe(BATCH_PACKET_ID);
        expect(BatchCodec.uncompressed().decode(wire)).toEqual(packets.map((packet) => packet.getBuffer()));

        const ours = BatchCodec.uncompressed().encode(packets.map((packet) => packet.getBuffer()));
        expect(ours).toEqual(wire);
    });

    it('produces byte-identical output to the server encoder', () => {
        // Same compression level, so the bytes must match exactly and not merely round-trip.
        const packets = [requestNetworkSettings(748), text('a'.repeat(600))];

        const batch = new BatchPacket();
        batch.compressed = true;
        packets.forEach((packet) => batch.addPacket(packet));
        batch.encode();

        expect(zlibCodec().encode(packets.map((packet) => packet.getBuffer()))).toEqual(batch.getBuffer());
    });

    it('server side reads a batch we chose not to compress', async () => {
        // The one case the server cannot yet produce but must survive receiving: our codec
        // honours a threshold, so a small packet goes out with a 0xff prefix.
        const codec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 4096 });
        const packets = [requestNetworkSettings(748).getBuffer()];

        const wire = codec.encode(packets);
        expect(wire[1]).toBe(UNCOMPRESSED_BATCH);

        const batch = new BatchPacket(wire);
        batch.compressed = true;
        expect(await batch.asyncDecode()).toEqual(packets);
    });
});
