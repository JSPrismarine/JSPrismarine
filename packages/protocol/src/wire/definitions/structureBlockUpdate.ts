/**
 * `StructureBlockUpdatePacket`: reports the structure block editor state to the server.
 *
 * Protocol 2193 and 2225 share one layout: `Block Position`, then `Structure Data` (name, data field, two
 * booleans, mode, `StructureSettings`, and redstone save mode), followed by `Trigger` and
 * `Is Waterlogged`. The redacted structure name is an optional string after its unredacted
 * form. The reference labels `Redstone Save Mode` as `uint8` yet marks it compressed; this layout
 * writes a ZigZag varint32, where `SavesToDisk` is `0x02`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/structure-block-update-packet/
 */
import type { AnimationMode, Mirror, StructureRotation } from '../../structure/StructureSettings';
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { blockPosStructure, vec3Structure } from '../structureTypes';
import { SINCE_2259 } from '../wireGates';

import type { PayloadOf } from '../define';

/** Which structure block mode the editor selected. */
export enum StructureBlockType {
    Data = 0,
    Save = 1,
    Load = 2,
    Corner = 3,
    Invalid = 4,
    Export = 5
}

/** Where a redstone-triggered save writes the structure. */
export enum StructureRedstoneSaveMode {
    SavesToMemory = 0,
    SavesToDisk = 1
}

/** The unfiltered and optional filtered forms of a user-entered structure name. */
const redactableString = t.record({
    /** `Unredacted`: text as the player entered it. */
    unredacted: t.string,
    /** `Redacted`: filtered text, or `null` when the server has no filtered form. */
    redacted: t.optional(t.string)
});

/** `StructureSettings`: the palette, bounds, and placement options of a structure. */
export const structureSettings = t.record({
    /** `Structure Palette Name`: vanilla uses `default`. */
    structurePaletteName: t.string,
    /** `Should Ignore Entities`: whether actors are omitted from the structure. */
    shouldIgnoreEntities: t.bool,
    /** `Should Ignore Blocks`: whether blocks are omitted from the structure. */
    shouldIgnoreBlocks: t.bool,
    /** `Should Allow Non Ticking Player And Ticking Area Chunks`: whether the structure may reach into chunks outside ticking areas and player range. */
    shouldAllowNonTickingPlayerAndTickingAreaChunks: t.bool,
    /** `Structure Size`: size of the structure in blocks. */
    structureSize: blockPosStructure,
    /** `Structure Offset`: offset of the structure from its origin. */
    structureOffset: blockPosStructure,
    /** `Last Edit Player`: unique id of the player who last edited these settings, a ZigZag varint64. */
    lastEditPlayer: t.varint64,
    /**
     * `Rotation`: quarter-turn applied when placing the structure, one byte. The 1.26.50 page numbers
     * `Clockwise90`, `Clockwise180` and `CounterClockwise90` 4 to 6; the 1.26.60 page and the pinned
     * 1.26.40 enum dump give 1 to 3, the values of `Rotate90`, `Rotate180` and `Rotate270`.
     */
    rotation: t.enumOf<StructureRotation>(t.uint8),
    /** `Mirror`: axes to mirror across when placing the structure, one byte. */
    mirror: t.enumOf<Mirror>(t.uint8),
    /** `Animation Mode`: animation used when placing the structure, one byte. */
    animationMode: t.enumOf<AnimationMode>(t.uint8),
    /** `Animation Seconds`: duration of the placement animation, as a little-endian float. */
    animationSeconds: t.lf32,
    /** `Integrity Value`: fraction of blocks to keep when randomly damaging the structure. */
    integrityValue: t.lf32,
    /** `Integrity Seed`: seed used to choose which blocks are removed by integrity, a little-endian uint32. */
    integritySeed: t.lu32,
    /** `Rotation Pivot`: point the structure rotates around, three little-endian floats. */
    rotationPivot: vec3Structure
});

/** `StructureEditorData`: the contents of the structure block editor. */
const structureEditorData = t.record({
    /** `Structure Name`: name used to save or load the structure. */
    structureName: redactableString,
    /** `Data Field`: function name used by data-mode structure blocks. */
    dataField: t.string,
    /** `Should Include Players`: whether player entities are included. */
    shouldIncludePlayers: t.bool,
    /** `Should Show Bounding Box`: whether to show the structure bounds. */
    shouldShowBoundingBox: t.bool,
    /** `Structure Block Type`: current editor mode, a ZigZag varint32. */
    structureBlockType: t.enumOf<StructureBlockType>(t.varint32),
    /** `Structure Settings`: bounds and placement settings for the structure. */
    structureSettings,
    /** `Redstone Save Mode`: where a redstone-triggered save writes the structure, a ZigZag varint32. */
    redstoneSaveMode: t.enumOf<StructureRedstoneSaveMode>(t.varint32)
});

/** The `StructureBlockUpdatePacket` field list; the module doc carries the wire provenance. */
export const structureBlockUpdatePacket = definePacket('StructureBlockUpdatePacket', {
    /** `Block Position`: position of the structure block. */
    blockPosition: blockPosStructure,
    /** `Structure Data`: contents of the editor. */
    structureData: structureEditorData,
    /** `Trigger`: whether to run the structure block immediately. */
    trigger: t.bool,
    /** `Is Waterlogged`: whether placed blocks are waterlogged. */
    isWaterlogged: t.bool,
    /** `KeepStructureVoid` from protocol 2259: whether a save keeps the structure void blocks. */
    keepStructureVoid: gated(SINCE_2259, t.bool, false)
});

/** Payload carried by `StructureBlockUpdatePacket`. */
export type StructureBlockUpdatePayload = PayloadOf<typeof structureBlockUpdatePacket>;
