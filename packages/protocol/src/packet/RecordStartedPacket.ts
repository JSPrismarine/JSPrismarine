import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { recordStartedPacket } from '../wire/definitions/recordStarted';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { RecordStartedPayload } from '../wire/definitions/recordStarted';

/** The fields of a `RecordStartedPacket`, in wire order. */
export type RecordStarted = RecordStartedPayload;

/**
 * Tells the client a record started playing at a block, such as a disc put into a jukebox.
 *
 * Layout at protocols 2193 and 2225, in wire order: `Block Position` as a `BlockPos` (three
 * ZigZag varint32), then `Server Sound Handle` as a little-endian uint64.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/record-started-packet/
 */
export default class RecordStartedPacket extends NetworkPacket<RecordStarted> {
    public get id(): number {
        return PacketIdentifier.RECORD_STARTED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RecordStarted): void {
        layoutAt(recordStartedPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RecordStarted {
        return layoutAt(recordStartedPacket, this.codecProtocol).decode(stream);
    }
}
