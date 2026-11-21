import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import { FlagType, Metadata, MetadataFlag } from '../wire/structures/Metadata';
import AddItemActorPacket from './AddItemActorPacket';

const air = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };

const payload = () => ({
    targetActorId: 5n,
    runtimeEntityId: 5n,
    item: air,
    position: new Vector3(1, 2, 3),
    motion: new Vector3(0, -1, 0.5),
    metadata: new Metadata(false),
    isFromFishing: false
});

describe('AddItemActorPacket', () => {
    it('writes the ids, item, vectors, empty metadata, and fishing flag in docs order', () => {
        const packet = new AddItemActorPacket(payload());
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([
                0x0f, 0x0a, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00,
                0x00, 0x40, 0x00, 0x00, 0x40, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0xbf, 0x00, 0x00, 0x00,
                0x3f, 0x00, 0x00
            ])
        );
    });

    it('round-trips actor state and an explicit signed target id', () => {
        const data = payload();
        data.targetActorId = -3n;
        data.metadata.setPropertyValue(MetadataFlag.COLOR, FlagType.BYTE, 7);
        data.isFromFishing = true;

        const encoded = new AddItemActorPacket(data);
        encoded.encode();
        const decoded = new AddItemActorPacket(encoded.getBuffer());
        decoded.decode();

        const result = decoded.getPacketData();
        if (result === null) throw new Error('AddItemActorPacket decoded without payload data');
        expect(result.targetActorId).toBe(-3n);
        expect(result.runtimeEntityId).toBe(5n);
        expect(result.item).toEqual(air);
        expect(result.position).toEqual(new Vector3(1, 2, 3));
        expect(result.motion).toEqual(new Vector3(0, -1, 0.5));
        expect(result.metadata.getData()).toEqual(data.metadata.getData());
        expect(result.isFromFishing).toBe(true);
    });

    it('writes the same bytes at protocols 2193 and 2225, which changed nothing in this packet', () => {
        const encodeAt = (protocol: number): Buffer => {
            const packet = new AddItemActorPacket(payload());
            packet.codecProtocol = protocol;
            packet.encode();
            return packet.getBuffer();
        };

        expect(encodeAt(2225)).toEqual(encodeAt(2193));
    });

    it('round-trips at protocol 2225', () => {
        const encoded = new AddItemActorPacket(payload());
        encoded.codecProtocol = 2225;
        encoded.encode();
        const decoded = new AddItemActorPacket(encoded.getBuffer());
        decoded.codecProtocol = 2225;
        decoded.decode();

        expect(decoded.getPacketData()?.position).toEqual(new Vector3(1, 2, 3));
    });
});
