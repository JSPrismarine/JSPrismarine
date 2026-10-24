import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import PlayerActionPacket, { PlayerAction } from './PlayerActionPacket';

/**
 * The packet as the client writes it under protocol 2193: header, Player Runtime ID as a
 * varuint64, Action as a ZigZag varint32, Block Position and Result Pos as `BlockPos` (three
 * ZigZag varint32 each, y signed like the others), then Face as a ZigZag varint32. Built by
 * hand so the test pins the layout rather than trusting `encodePayload` to agree with
 * `decodePayload`.
 */
const clientBytes = (
    runtimeId: bigint,
    action: number,
    block: BlockPosition,
    result: BlockPosition,
    face: number
): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(Identifiers.PlayerActionPacket);
    out.writeUnsignedVarLong(runtimeId);
    out.writeVarInt(action);
    out.writeVarInt(block.getX());
    out.writeVarInt(block.getY());
    out.writeVarInt(block.getZ());
    out.writeVarInt(result.getX());
    out.writeVarInt(result.getY());
    out.writeVarInt(result.getZ());
    out.writeVarInt(face);
    return out.getBuffer();
};

/** The same packet as literal bytes, so a drift in `BinaryStream` cannot hide behind the builder. */
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

describe('network', () => {
    describe('packet', () => {
        describe('PlayerActionPacket', () => {
            it('reads a position below zero with a signed y, then stops at the end', () => {
                const packet = new PlayerActionPacket(
                    clientBytes(
                        300n,
                        PlayerAction.START_CRAWLING,
                        new BlockPosition(10, -3, -7),
                        new BlockPosition(10, -2, -7),
                        4
                    )
                );
                packet.decode();

                expect(packet.runtimeEntityId).toBe(300n);
                expect(packet.action).toBe(PlayerAction.START_CRAWLING);
                expect(packet.blockPosition.getX()).toBe(10);
                expect(packet.blockPosition.getY()).toBe(-3);
                expect(packet.blockPosition.getZ()).toBe(-7);
                expect(packet.resultPosition.getX()).toBe(10);
                expect(packet.resultPosition.getY()).toBe(-2);
                expect(packet.resultPosition.getZ()).toBe(-7);
                expect(packet.blockFace).toBe(4);
                expect(packet.feof()).toBe(true);
            });

            it('writes the fields in docs order with every coordinate ZigZag encoded', () => {
                const packet = new PlayerActionPacket();
                packet.runtimeEntityId = 300n;
                packet.action = PlayerAction.START_CRAWLING;
                packet.blockPosition = new BlockPosition(10, -3, -7);
                packet.resultPosition = new BlockPosition(10, -2, -7);
                packet.blockFace = 4;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual(expectedBytes);
                expect([...packet.getBuffer()]).toEqual([
                    ...clientBytes(
                        300n,
                        PlayerAction.START_CRAWLING,
                        new BlockPosition(10, -3, -7),
                        new BlockPosition(10, -2, -7),
                        4
                    )
                ]);
            });
        });
    });
});
