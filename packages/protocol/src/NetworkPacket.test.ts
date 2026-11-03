import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from './NetworkBinaryStream';
import NetworkPacket from './NetworkPacket';
import { BatchCodec } from './BatchCodec';

class PayloadPacket extends NetworkPacket<number> {
    public constructor(value: number) {
        super(value);
        this.setNetId(0x21);
    }

    protected serializePayload(stream: NetworkBinaryStream, value: number): void {
        stream.writeUnsignedVarInt(value);
    }

    protected deserializePayload(stream: NetworkBinaryStream): number {
        return stream.readUnsignedVarInt();
    }
}

describe('NetworkPacket transient encoding', () => {
    it('keeps cached bytes stable while transient views are assembled into a batch', () => {
        const packet = new PayloadPacket(42);
        packet.encode();
        const cached = packet.getBuffer();
        const cachedBytes = Buffer.from(cached);

        const transient = packet.encodeTransient();
        const second = new PayloadPacket(99).encodeTransient();
        const batch = BatchCodec.uncompressed().encode([transient, second]);

        expect(transient).toStrictEqual(cachedBytes);
        expect(packet.getBuffer()).toBe(cached);
        expect(packet.getBuffer()).toStrictEqual(cachedBytes);
        const [firstDecoded, secondDecoded] = BatchCodec.uncompressed().decode(batch);
        expect(firstDecoded).toStrictEqual(cachedBytes);
        expect(secondDecoded).toStrictEqual(Buffer.from([0x21, 0x63]));
        const decodedPacket = new PayloadPacket(0);
        const decodedStream = new NetworkBinaryStream(firstDecoded);
        expect(decodedPacket.deserialize(decodedStream)).toBe(42);
        expect(decodedStream.feof()).toBe(true);

        packet.encode();
        expect(transient).toStrictEqual(cachedBytes);
        expect(batch).toStrictEqual(BatchCodec.uncompressed().encode([cachedBytes, Buffer.from([0x21, 0x63])]));
    });
});
