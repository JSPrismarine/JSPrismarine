import BlockPos from './BlockPos';
import Vec3 from './Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The quarter-turn applied when a structure is placed, written as one byte. */
export enum StructureRotation {
    None = 0,
    Rotate90 = 1,
    Rotate180 = 2,
    Rotate270 = 3,
    /** The same value as {@link StructureRotation.Rotate90}. */
    Clockwise90 = 1,
    /** The same value as {@link StructureRotation.Rotate180}. */
    Clockwise180 = 2,
    /** The same value as {@link StructureRotation.Rotate270}. */
    CounterClockwise90 = 3
}

/** The axes a structure is mirrored across, written as one byte. */
export enum Mirror {
    None = 0,
    X = 1,
    Z = 2,
    XZ = 3
}

/** How a structure animates into place, written as one byte. */
export enum AnimationMode {
    None = 0,
    Layers = 1,
    Blocks = 2
}

/**
 * The palette, bounds, and placement options of a structure.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/structure-settings/
 */
export interface StructureSettings {
    /** Palette name; vanilla uses `default`. */
    structurePaletteName: string;
    /** Whether actors are omitted from the structure. */
    shouldIgnoreEntities: boolean;
    /** Whether blocks are omitted from the structure. */
    shouldIgnoreBlocks: boolean;
    /** Whether the structure may reach into chunks outside ticking areas and player range. */
    shouldAllowNonTickingPlayerAndTickingAreaChunks: boolean;
    /** Size of the structure in blocks. */
    structureSize: BlockPos;
    /** Offset of the structure from its origin. */
    structureOffset: BlockPos;
    /** Unique id of the player who last edited these settings. */
    lastEditPlayer: bigint;
    /** Quarter-turn applied when placing the structure. */
    rotation: StructureRotation;
    /** Axes to mirror across when placing the structure. */
    mirror: Mirror;
    /** Animation used when placing the structure. */
    animationMode: AnimationMode;
    /** Duration of the placement animation, in seconds. */
    animationSeconds: number;
    /** Fraction of blocks to keep when randomly damaging the structure. */
    integrityValue: number;
    /** Seed used to choose which blocks are removed by integrity. */
    integritySeed: number;
    /** Point the structure rotates around. */
    rotationPivot: Vec3;
}

/** A new structure starts at the origin with every block and actor included. */
export const defaultStructureSettings = (): StructureSettings => ({
    structurePaletteName: 'default',
    shouldIgnoreEntities: false,
    shouldIgnoreBlocks: false,
    shouldAllowNonTickingPlayerAndTickingAreaChunks: false,
    structureSize: new BlockPos(0, 0, 0),
    structureOffset: new BlockPos(0, 0, 0),
    lastEditPlayer: 0n,
    rotation: StructureRotation.None,
    mirror: Mirror.None,
    animationMode: AnimationMode.None,
    animationSeconds: 0,
    integrityValue: 0,
    integritySeed: 0,
    rotationPivot: new Vec3(0, 0, 0)
});

/** Reads the docs' `StructureSettings` fields in wire order. */
export const readStructureSettings = (stream: NetworkBinaryStream): StructureSettings => {
    const structurePaletteName = stream.readString();
    const shouldIgnoreEntities = stream.readBoolean();
    const shouldIgnoreBlocks = stream.readBoolean();
    const shouldAllowNonTickingPlayerAndTickingAreaChunks = stream.readBoolean();
    const structureSize = new BlockPos(0, 0, 0);
    structureSize.deserialize(stream);
    const structureOffset = new BlockPos(0, 0, 0);
    structureOffset.deserialize(stream);
    const lastEditPlayer = stream.readVarLong();
    const rotation: StructureRotation = stream.readByte();
    const mirror: Mirror = stream.readByte();
    const animationMode: AnimationMode = stream.readByte();
    const animationSeconds = stream.readFloatLE();
    const integrityValue = stream.readFloatLE();
    const integritySeed = stream.readUnsignedIntLE();
    const rotationPivot = new Vec3(0, 0, 0);
    rotationPivot.deserialize(stream);

    return {
        structurePaletteName,
        shouldIgnoreEntities,
        shouldIgnoreBlocks,
        shouldAllowNonTickingPlayerAndTickingAreaChunks,
        structureSize,
        structureOffset,
        lastEditPlayer,
        rotation,
        mirror,
        animationMode,
        animationSeconds,
        integrityValue,
        integritySeed,
        rotationPivot
    };
};

/** Writes the docs' `StructureSettings` fields in wire order. */
export const writeStructureSettings = (stream: NetworkBinaryStream, settings: StructureSettings): void => {
    stream.writeString(settings.structurePaletteName);
    stream.writeBoolean(settings.shouldIgnoreEntities);
    stream.writeBoolean(settings.shouldIgnoreBlocks);
    stream.writeBoolean(settings.shouldAllowNonTickingPlayerAndTickingAreaChunks);
    settings.structureSize.serialize(stream);
    settings.structureOffset.serialize(stream);
    stream.writeVarLong(settings.lastEditPlayer);
    stream.writeByte(settings.rotation);
    stream.writeByte(settings.mirror);
    stream.writeByte(settings.animationMode);
    stream.writeFloatLE(settings.animationSeconds);
    stream.writeFloatLE(settings.integrityValue);
    stream.writeUnsignedIntLE(settings.integritySeed);
    settings.rotationPivot.serialize(stream);
};
