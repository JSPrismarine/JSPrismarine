import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** What the Education Edition chemistry lab table was asked to do. */
export enum LabTableType {
    StartCombine = 0,
    StartReaction = 1,
    Reset = 2
}

/** The reaction effect produced by an Education Edition chemistry lab table. */
export enum LabTableReactionType {
    None = 0,
    IceBomb = 1,
    Bleach = 2,
    ElephantToothpaste = 3,
    Fertilizer = 4,
    HeatBlock = 5,
    MagnesiumSalts = 6,
    MiscFire = 7,
    MiscExplosion = 8,
    MiscLava = 9,
    MiscMystical = 10,
    MiscSmoke = 11,
    MiscLargeSmoke = 12
}

/** The action, position, and optional reaction carried by a chemistry lab table exchange. */
export interface LabTable {
    /** Whether the client started a combination, started a reaction, or reset the table. */
    type: LabTableType;
    /** Position of the lab table as a signed `BlockPos`. */
    position: BlockPos;
    /** Effect to play for `StartReaction`; otherwise `None`. */
    reaction: LabTableReactionType;
}

/**
 * A client action or server reaction for the Education Edition chemistry lab table.
 *
 * Protocol 2193 layout: `Type` (uint8), `Position` (three ZigZag varint32 coordinates),
 * and `Reaction` (uint8). The client sends `StartCombine`; the server can answer with
 * `StartReaction` and a reaction effect.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/lab-table-packet/
 */
export default class LabTablePacket extends NetworkPacket<LabTable> {
    public get id(): number {
        return PacketIdentifier.LAB_TABLE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LabTable): void {
        stream.writeByte(data.type);
        data.position.serialize(stream);
        stream.writeByte(data.reaction);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LabTable {
        const type: LabTableType = stream.readByte();
        const position = new BlockPos(0, 0, 0);
        position.deserialize(stream);
        const reaction: LabTableReactionType = stream.readByte();
        return { type, position, reaction };
    }
}
