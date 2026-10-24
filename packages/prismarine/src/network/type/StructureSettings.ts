import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';

/**
 * The docs' `Rotation`: how far a structure is turned when it is placed, written as one byte.
 *
 * `Clockwise90`, `Clockwise180` and `CounterClockwise90` are other names for 1, 2 and 3, not
 * members 4, 5 and 6 as the rendered 1.26.51 page lists them. The datagen snapshot in
 * `packages/minecraft` numbers them 1, 2 and 3, and the page's own 2207 changelog "moves"
 * them back down to those values.
 */
export enum Rotation {
    None = 0,
    Rotate90 = 1,
    Rotate180 = 2,
    Rotate270 = 3,
    /** The same value as {@link Rotation.Rotate90}. */
    Clockwise90 = 1,
    /** The same value as {@link Rotation.Rotate180}. */
    Clockwise180 = 2,
    /** The same value as {@link Rotation.Rotate270}. */
    CounterClockwise90 = 3
}

/** The docs' `Mirror`: which axes a structure is flipped across, written as one byte. */
export enum Mirror {
    None = 0,
    X = 1,
    Z = 2,
    XZ = 3
}

/** The docs' `AnimationMode`: how a structure builds itself in when it is placed, written as one byte. */
export enum AnimationMode {
    None = 0,
    Layers = 1,
    Blocks = 2
}

/**
 * The docs' `StructureSettings`: what a structure block includes, where, and how it is placed.
 *
 * Carried by `StructureTemplateDataRequestPacket` as `Structure Settings` and inside the
 * `StructureEditorData` of `StructureBlockUpdatePacket`.
 *
 * Wire order at protocol 2193: `Structure Palette Name` as a string, `Should ignore entities?`,
 * `Should ignore blocks?` and `Should Allow Non Ticking Player and Ticking Area Chunks` as one
 * byte each, `Structure Size` and `Structure Offset` as block positions (three ZigZag
 * varint32), `Last Edit Player` as a ZigZag varint64, `Rotation`, `Mirror` and `Animation Mode`
 * as one byte each, `Animation Seconds` and `Integrity Value` as floats LE, `Integrity Seed`
 * as a uint32 LE, then `Rotation Pivot` as three floats LE.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/structure-settings/
 */
export interface StructureSettings {
    /** `Structure Palette Name`: the block palette to use. Vanilla has only sent `default` so far. */
    structurePaletteName: string;

    /** `Should ignore entities?`: true leaves actors out of the structure. */
    shouldIgnoreEntities: boolean;

    /** `Should ignore blocks?`: true leaves blocks out of the structure. */
    shouldIgnoreBlocks: boolean;

    /**
     * `Should Allow Non Ticking Player and Ticking Area Chunks`: true lets the structure reach
     * into chunks that are neither player loaded nor in a ticking area.
     */
    shouldAllowNonTickingPlayerAndTickingAreaChunks: boolean;

    /** `Structure Size`: how far the area reaches from its start, in blocks. */
    structureSize: BlockPosition;

    /** `Structure Offset`: where the area starts, relative to the structure block. */
    structureOffset: BlockPosition;

    /** `Last Edit Player`: the unique id of the player who last changed these settings. */
    lastEditPlayer: bigint;

    rotation: Rotation;
    mirror: Mirror;
    animationMode: AnimationMode;

    /** `Animation Seconds`: how long the placement animation takes. */
    animationSeconds: number;

    /** `Integrity Value`: the share of blocks to keep, from 0 to 1. Which ones are dropped follows the seed. */
    integrityValue: number;

    /** `Integrity Seed`: the seed that picks the dropped blocks. 0 means a random one. */
    integritySeed: number;

    /** `Rotation Pivot`: the point the structure turns around. */
    rotationPivot: Vector3;
}

/** The settings a structure block starts out with: everything included, nothing moved. */
export const defaultStructureSettings = (): StructureSettings => ({
    structurePaletteName: 'default',
    shouldIgnoreEntities: false,
    shouldIgnoreBlocks: false,
    shouldAllowNonTickingPlayerAndTickingAreaChunks: false,
    structureSize: new BlockPosition(0, 0, 0),
    structureOffset: new BlockPosition(0, 0, 0),
    lastEditPlayer: 0n,
    rotation: Rotation.None,
    mirror: Mirror.None,
    animationMode: AnimationMode.None,
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
    shouldAllowNonTickingPlayerAndTickingAreaChunks: stream.readBoolean(),
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
    stream.writeBoolean(settings.shouldAllowNonTickingPlayerAndTickingAreaChunks);
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
