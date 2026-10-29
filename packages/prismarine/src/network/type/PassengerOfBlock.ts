import type BinaryStream from '@jsprismarine/binaryutils';
import type { Vector3 } from '@jsprismarine/math';

import type BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';

/**
 * The docs' `PassengerOfBlockArguments__EmoteType`: the pose an entity takes while riding a
 * block. Protocol 2225 values, from the v1.26.60 `metadata.zip` schema.
 */
export enum PassengerOfBlockEmoteType {
    Sitting = 0,
    Standing = 1
}

/**
 * The docs' `PassengerOfBlockArguments`, new at protocol 2225: the block an entity is riding.
 *
 * Travels as an optional trailing structure on `AddActorPacket` and before the device id on
 * `AddPlayerPacket` - one presence byte, then these five fields when it is 0x01. Layout from
 * the v1.26.60 `metadata.zip` (`PassengerOfBlockArguments.json`, ordinals 0-4) and
 * gophertunnel's `PassengerOfBlockData.Marshal`, which agree.
 */
export interface PassengerOfBlock {
    /** BlockPos: the ridden block, three signed varints. */
    blockPosition: BlockPosition;
    /** Offset of the entity relative to the block, each component in -5..5. */
    offset: Vector3;
    /** Rotation while riding, in degrees 0..360, as a little-endian float. */
    rotation: number;
    /** RotationLimit in degrees 0..360, as a little-endian float. */
    rotationLimit: number;
    /** EmoteType, one {@link PassengerOfBlockEmoteType} byte. */
    emoteType: number;
}

/**
 * Writes an optional `PassengerOfBlockArguments`: a presence byte, then the five fields.
 * @param {BinaryStream} stream - the stream to write to.
 * @param {PassengerOfBlock | null} passenger - the ridden block, or `null` for not riding.
 */
export const writePassengerOfBlock = (stream: BinaryStream, passenger: PassengerOfBlock | null): void => {
    stream.writeBoolean(passenger !== null);
    if (passenger === null) return;

    NetworkUtil.writeBlockPosition(stream, passenger.blockPosition);
    NetworkUtil.writeVector3(stream, passenger.offset);
    stream.writeFloatLE(passenger.rotation);
    stream.writeFloatLE(passenger.rotationLimit);
    stream.writeByte(passenger.emoteType);
};

/**
 * Reads an optional `PassengerOfBlockArguments`, the mirror of {@link writePassengerOfBlock}.
 * @param {BinaryStream} stream - the stream to read from.
 * @returns {PassengerOfBlock | null} the ridden block, or `null` when the presence byte is 0.
 */
export const readPassengerOfBlock = (stream: BinaryStream): PassengerOfBlock | null => {
    if (!stream.readBoolean()) return null;

    return {
        blockPosition: NetworkUtil.readBlockPosition(stream),
        offset: NetworkUtil.readVector3(stream),
        rotation: stream.readFloatLE(),
        rotationLimit: stream.readFloatLE(),
        emoteType: stream.readByte()
    };
};
