import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `RecordStartedPacket`, in wire order. */
export interface RecordStarted {
    /** `Block Position`: the jukebox the record plays from. */
    position: BlockPos;
    /** `Server Sound Handle`: the `ServerSoundHandle` a later `ClientboundUpdateSoundDataPacket` can change the sound by. */
    serverSoundHandle: bigint;
}

/**
 * Tells the client a record started playing at a block, such as a disc put into a jukebox.
 *
 * Protocol 2193 layout, in wire order: `Block Position` as a {@link BlockPos} (three ZigZag
 * varint32), then `Server Sound Handle` as a little-endian uint64.
 */
export default class RecordStartedPacket extends NetworkPacket<RecordStarted> {
    public get id(): number {
        return PacketIdentifier.RECORD_STARTED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RecordStarted): void {
        data.position.serialize(stream);
        stream.writeUnsignedLongLE(data.serverSoundHandle);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RecordStarted {
        return {
            position: BlockPos.deserialize(stream),
            serverSoundHandle: stream.readUnsignedLongLE()
        };
    }
}
