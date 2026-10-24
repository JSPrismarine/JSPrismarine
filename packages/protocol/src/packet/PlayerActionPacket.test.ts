import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerActionPacket, { PlayerActionType } from './PlayerActionPacket';

import type { PlayerActionData } from './PlayerActionPacket';

/**
 * The packet as the client writes it under protocol 2193, header included: Player Runtime ID
 * as a varuint64, Action as a ZigZag varint32, Block Position and Result Pos as `BlockPos`
 * (three ZigZag varint32 each, y signed like the others), then Face as a ZigZag varint32.
 */
const clientBytes = (data: PlayerActionData): Buffer => {
    const out = new NetworkBinaryStream();
    out.writeUnsignedVarInt(0x24);
    out.writeUnsignedVarLong(data.runtimeEntityId);
    out.writeVarInt(data.action);
    out.writeVarInt(data.blockPosition.x);
    out.writeVarInt(data.blockPosition.y);
    out.writeVarInt(data.blockPosition.z);
    out.writeVarInt(data.resultPosition.x);
    out.writeVarInt(data.resultPosition.y);
    out.writeVarInt(data.resultPosition.z);
    out.writeVarInt(data.blockFace);
    return out.getBuffer();
};

/** The same packet as literal bytes, so a drift in the stream cannot hide behind the builder. */
const expectedBytes = [
    0x24, // Header: id 36, no subclient ids.
    0xac,
    0x02, // Player Runtime ID: 300 as a varuint64.
    0x40, // Action: StartCrawling (32) ZigZag encoded.
    0x14, // Block Position X: 10
    0x05, // Block Position Y: -3
    0x0d, // Block Position Z: -7
    0x14, // Result Pos X: 10
    0x03, // Result Pos Y: -2
    0x0d, // Result Pos Z: -7
    0x08 // Face: 4
];

const sample: PlayerActionData = {
    runtimeEntityId: 300n,
    action: PlayerActionType.START_CRAWLING,
    blockPosition: { x: 10, y: -3, z: -7 },
    resultPosition: { x: 10, y: -2, z: -7 },
    blockFace: 4
};

describe('PlayerActionPacket', () => {
    it('reads a position below zero with a signed y, then stops at the end', () => {
        const stream = new NetworkBinaryStream(clientBytes(sample));
        const data = new PlayerActionPacket().deserialize(stream);

        expect(data).toEqual(sample);
        expect(stream.feof()).toBe(true);
    });

    it('writes the fields in docs order with every coordinate ZigZag encoded', () => {
        const buffer = new PlayerActionPacket(sample).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual(expectedBytes);
        expect(buffer).toEqual(clientBytes(sample));
    });
});
