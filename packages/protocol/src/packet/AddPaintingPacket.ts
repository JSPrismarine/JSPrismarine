import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Data needed to add a painting actor to the client world. */
export interface AddPainting {
    /** Unique actor id assigned to the painting. */
    targetActorId: bigint;
    /** Runtime id used for this actor in the current session. */
    targetRuntimeId: bigint;
    /** Bottom-left corner of the painting. */
    position: Vec3;
    /** Direction the painting faces on its wall. */
    direction: number;
    /** Client-known painting motif, such as `Kebab`. */
    motif: string;
}

/**
 * Adds a painting actor without a generic actor-add packet. The motif identifies both the
 * artwork and its dimensions, so no generic actor metadata accompanies the position.
 *
 * Protocol 2193 layout: `Target Actor ID` as a ZigZag varint64, `Target Runtime ID` as an
 * unsigned varint64, `Position` as three little-endian floats, `Direction` as a ZigZag
 * varint32, then `Motif` as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-painting-packet/
 */
export default class AddPaintingPacket extends NetworkPacket<AddPainting> {
    public get id(): number {
        return PacketIdentifier.ADD_PAINTING;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddPainting): void {
        stream.writeVarLong(data.targetActorId);
        stream.writeUnsignedVarLong(data.targetRuntimeId);
        data.position.serialize(stream);
        stream.writeVarInt(data.direction);
        stream.writeString(data.motif);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddPainting {
        const targetActorId = stream.readVarLong();
        const targetRuntimeId = stream.readUnsignedVarLong();
        const position = new Vec3(0, 0, 0);
        position.deserialize(stream);
        const direction = stream.readVarInt();
        const motif = stream.readString();
        return { targetActorId, targetRuntimeId, position, direction, motif };
    }
}
