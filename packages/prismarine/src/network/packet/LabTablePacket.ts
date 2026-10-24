import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/** What the lab table is being asked to do, as the Type byte numbers it. */
export enum LabTableType {
    StartCombine = 0,
    StartReaction = 1,
    Reset = 2
}

/** The reaction a lab table produced, as the Reaction byte numbers it. */
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

/**
 * The Education Edition chemistry lab table combining or reacting its contents.
 *
 * Travels both ways. The client sends `StartCombine` when a player presses the button in the
 * lab table screen; the server answers with `StartReaction` naming the effect to play.
 *
 * Wire layout at protocol 2193: Type as a `LabTableType` byte, Position as a `BlockPos` (three
 * ZigZag varint32), then Reaction as a `LabTableReactionType` byte.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/lab-table-packet/
 */
export default class LabTablePacket extends DataPacket {
    public static NetID = Identifiers.LabTablePacket;

    public type: LabTableType = LabTableType.StartCombine;

    /** Where the lab table stands. */
    public position = new BlockPosition(0, 0, 0);

    /** Meaningful on a `StartReaction`; `None` otherwise. */
    public reaction: LabTableReactionType = LabTableReactionType.None;

    /** Reads the action, the table position and the reaction. */
    public decodePayload(): void {
        this.type = this.readByte();
        this.position = NetworkUtil.readBlockPosition(this);
        this.reaction = this.readByte();
    }

    /** Writes the action, the table position and the reaction. */
    public encodePayload(): void {
        this.writeByte(this.type);
        NetworkUtil.writeBlockPosition(this, this.position);
        this.writeByte(this.reaction);
    }
}
