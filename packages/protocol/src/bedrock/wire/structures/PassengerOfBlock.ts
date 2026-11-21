import { frozen } from '../../../wire/frozen';
import type BinaryStream from '@jsprismarine/binaryutils';
import type { Vector3 } from '@jsprismarine/math';
import { NetworkUtil } from '../../../wire/networkUtil';
import UUID from './UUID';

/**
 * The docs' `PassengerOfBlockArguments__EmoteType`: the pose an entity takes while riding a
 * block. Protocol 2225 values, from the docs' `PassengerOfBlockArguments::EmoteType` page:
 * Standing 0, Riding 1, Laying 2.
 */
export enum PassengerOfBlockEmoteType {
    Standing = 0,
    Riding = 1,
    Laying = 2
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
    blockPosition: Vector3;
    /** Offset of the entity relative to the block, each component in -5..5. */
    offset: Vector3;
    /** Rotation while riding, in degrees 0..360, as a little-endian float. */
    rotation: number;
    /** RotationLimit in degrees 0..360, as a little-endian float. */
    rotationLimit: number;
    /** EmoteType, one `PassengerOfBlockEmoteType` byte. */
    emoteType: number;
    /**
     * `BlockType` from protocol 2259: the ridden block's type, a little-endian uint64. Absent,
     * a 2259 writer sends 0.
     */
    blockType?: bigint;
    /**
     * `PackUUID` from protocol 2259: the pack that defines the ridden block. Absent, a 2259
     * writer sends the nil UUID.
     */
    packUuid?: UUID;
}

/** Which `PassengerOfBlockArguments` layout to read or write: 2259 appended two fields. */
export interface PassengerOfBlockLayout {
    /** Whether `BlockType` and `PackUUID` follow `EmoteType`. */
    readonly carriesBlockType: boolean;
}

/** The layout protocols 2225 up to 2259 use: the five fields alone. */
export const PASSENGER_OF_BLOCK_2225: PassengerOfBlockLayout = frozen({ carriesBlockType: false });

/** The layout from protocol 2259: the five fields, then `BlockType` and `PackUUID`. */
export const PASSENGER_OF_BLOCK_2259: PassengerOfBlockLayout = frozen({ carriesBlockType: true });

/**
 * Writes an optional `PassengerOfBlockArguments`: a presence byte, then the fields its layout carries.
 * @param {BinaryStream} stream - the stream to write to.
 * @param {PassengerOfBlock | null} passenger - the ridden block, or `null` for not riding.
 * @param {PassengerOfBlockLayout} layout - which protocol's field list to write.
 */
export const writePassengerOfBlock = (
    stream: BinaryStream,
    passenger: PassengerOfBlock | null,
    layout: PassengerOfBlockLayout = PASSENGER_OF_BLOCK_2225
): void => {
    stream.writeBoolean(passenger !== null);
    if (passenger === null) return;

    NetworkUtil.writeBlockPosition(stream, passenger.blockPosition);
    NetworkUtil.writeVector3(stream, passenger.offset);
    stream.writeFloatLE(passenger.rotation);
    stream.writeFloatLE(passenger.rotationLimit);
    stream.writeByte(passenger.emoteType);
    if (!layout.carriesBlockType) return;

    stream.writeUnsignedLongLE(passenger.blockType ?? 0n);
    (passenger.packUuid ?? new UUID()).networkSerialize(stream);
};

/**
 * Reads an optional `PassengerOfBlockArguments`, the mirror of {@link writePassengerOfBlock}.
 * @param {BinaryStream} stream - the stream to read from.
 * @param {PassengerOfBlockLayout} layout - which protocol's field list to read.
 * @returns {PassengerOfBlock | null} the ridden block, or `null` when the presence byte is 0.
 */
export const readPassengerOfBlock = (
    stream: BinaryStream,
    layout: PassengerOfBlockLayout = PASSENGER_OF_BLOCK_2225
): PassengerOfBlock | null => {
    if (!stream.readBoolean()) return null;

    const passenger: PassengerOfBlock = {
        blockPosition: NetworkUtil.readBlockPosition(stream),
        offset: NetworkUtil.readVector3(stream),
        rotation: stream.readFloatLE(),
        rotationLimit: stream.readFloatLE(),
        emoteType: stream.readByte()
    };
    if (!layout.carriesBlockType) return passenger;

    return { ...passenger, blockType: stream.readUnsignedLongLE(), packUuid: UUID.networkDeserialize(stream) };
};
