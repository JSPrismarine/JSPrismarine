import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/**
 * How far a structure is turned when it is placed, as the Rotation byte numbers it.
 *
 * The docs also list `Clockwise90`, `Clockwise180` and `CounterClockwise90`. Those are the
 * same three wire values under their newer names, which the 2207 changelog confirms by
 * renumbering them from 4, 5 and 6 down to 1, 2 and 3.
 */
export enum StructureRotation {
    None = 0,
    Rotate90 = 1,
    Rotate180 = 2,
    Rotate270 = 3
}

/** Which axes a structure is flipped across, as the Mirror byte numbers it. */
export enum StructureMirror {
    None = 0,
    X = 1,
    Z = 2,
    XZ = 3
}

/** How a structure builds itself in when it is placed, as the Animation Mode byte numbers it. */
export enum StructureAnimationMode {
    None = 0,
    Layers = 1,
    Blocks = 2
}

/** What the client wants done with the structure, as the Requested Operation byte numbers it. */
export enum StructureTemplateRequestOperation {
    None = 0,
    ExportFromSaveMode = 1,
    ExportFromLoadMode = 2,
    QuerySavedStructure = 3
}

/**
 * The contents of a structure block's screen: what to include, where, and how to place it.
 *
 * Shared with `StructureBlockUpdatePacket`, which carries the same type inside its
 * `StructureEditorData`.
 */
export interface StructureSettings {
    /** Palette the structure's blocks come from. Vanilla only ever sends `default`. */
    structurePaletteName: string;

    shouldIgnoreEntities: boolean;
    shouldIgnoreBlocks: boolean;

    /** Let the export reach into chunks that are neither player loaded nor in a ticking area. */
    shouldAllowNonTickingChunks: boolean;

    /** Extent of the area, counted from the structure block plus the offset. */
    structureSize: BlockPosition;

    /** Corner of the area, relative to the structure block. */
    structureOffset: BlockPosition;

    /** Unique id of the player who last touched the structure block. */
    lastEditPlayer: bigint;

    rotation: StructureRotation;
    mirror: StructureMirror;
    animationMode: StructureAnimationMode;

    /** How long the placement animation runs. */
    animationSeconds: number;

    /** Fraction of blocks kept, 0 to 1. Below 1 the seed decides which ones are dropped. */
    integrityValue: number;

    /** Seed for the integrity roll. 0 means the game picks one. */
    integritySeed: number;

    /** Point the rotation turns the structure around. */
    rotationPivot: Vector3;
}

/** The settings a structure block starts out with: everything included, nothing moved. */
export const defaultStructureSettings = (): StructureSettings => ({
    structurePaletteName: 'default',
    shouldIgnoreEntities: false,
    shouldIgnoreBlocks: false,
    shouldAllowNonTickingChunks: false,
    structureSize: new BlockPosition(0, 0, 0),
    structureOffset: new BlockPosition(0, 0, 0),
    lastEditPlayer: 0n,
    rotation: StructureRotation.None,
    mirror: StructureMirror.None,
    animationMode: StructureAnimationMode.None,
    animationSeconds: 0,
    integrityValue: 0,
    integritySeed: 0,
    rotationPivot: new Vector3(0, 0, 0)
});

/** Reads a `StructureSettings` in wire order. */
export const readStructureSettings = (stream: BinaryStream): StructureSettings => ({
    structurePaletteName: NetworkUtil.readString(stream),
    shouldIgnoreEntities: stream.readBoolean(),
    shouldIgnoreBlocks: stream.readBoolean(),
    shouldAllowNonTickingChunks: stream.readBoolean(),
    structureSize: NetworkUtil.readBlockPosition(stream),
    structureOffset: NetworkUtil.readBlockPosition(stream),
    lastEditPlayer: stream.readVarLong(),
    rotation: stream.readByte(),
    mirror: stream.readByte(),
    animationMode: stream.readByte(),
    animationSeconds: stream.readFloatLE(),
    integrityValue: stream.readFloatLE(),
    integritySeed: stream.readUnsignedIntLE(),
    rotationPivot: NetworkUtil.readVector3(stream)
});

/** Writes a `StructureSettings` in wire order. */
export const writeStructureSettings = (stream: BinaryStream, settings: StructureSettings): void => {
    NetworkUtil.writeString(stream, settings.structurePaletteName);
    stream.writeBoolean(settings.shouldIgnoreEntities);
    stream.writeBoolean(settings.shouldIgnoreBlocks);
    stream.writeBoolean(settings.shouldAllowNonTickingChunks);
    NetworkUtil.writeBlockPosition(stream, settings.structureSize);
    NetworkUtil.writeBlockPosition(stream, settings.structureOffset);
    stream.writeVarLong(settings.lastEditPlayer);
    stream.writeByte(settings.rotation);
    stream.writeByte(settings.mirror);
    stream.writeByte(settings.animationMode);
    stream.writeFloatLE(settings.animationSeconds);
    stream.writeFloatLE(settings.integrityValue);
    stream.writeUnsignedIntLE(settings.integritySeed);
    NetworkUtil.writeVector3(stream, settings.rotationPivot);
};

/**
 * A structure block asking the server for a structure's data.
 *
 * Sent when the player presses Export or Load in the structure block screen. Mojang's docs say
 * the feature is switched off server-side and the request does nothing.
 *
 * Wire layout at protocol 2193: Structure Name as a string, Structure Position as a `BlockPos`
 * (three ZigZag varint32), Structure Settings as a `StructureSettings`, then Requested
 * Operation as a `StructureTemplateRequestOperation` byte.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/structure-template-data-request-packet/
 */
export default class StructureTemplateDataRequestPacket extends DataPacket {
    public static NetID = Identifiers.StructureTemplateDataRequestPacket;

    /** Name typed into the structure block, which is also the file name on export. */
    public structureName = '';

    /** Where the structure block stands. */
    public structurePosition = new BlockPosition(0, 0, 0);

    public structureSettings: StructureSettings = defaultStructureSettings();

    public requestedOperation: StructureTemplateRequestOperation = StructureTemplateRequestOperation.None;

    /** Reads the name, the block position, the settings and the operation. */
    public decodePayload(): void {
        this.structureName = NetworkUtil.readString(this);
        this.structurePosition = NetworkUtil.readBlockPosition(this);
        this.structureSettings = readStructureSettings(this);
        this.requestedOperation = this.readByte();
    }

    /** Writes the name, the block position, the settings and the operation. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.structureName);
        NetworkUtil.writeBlockPosition(this, this.structurePosition);
        writeStructureSettings(this, this.structureSettings);
        this.writeByte(this.requestedOperation);
    }
}
