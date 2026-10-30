import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';
import { readStructureSettings, writeStructureSettings } from '../structure/StructureSettings';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { StructureSettings } from '../structure/StructureSettings';

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
export interface RedactableString {
    /** Text as the player entered it. */
    unredacted: string;
    /** Filtered text, or `null` when the server has no filtered form. */
    redacted: string | null;
}

/**
 * The contents of the structure block editor.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/structure-editor-data/
 */
export interface StructureEditorData {
    /** Name used to save or load the structure. */
    structureName: RedactableString;
    /** Function name used by data-mode structure blocks. */
    dataField: string;
    /** Whether player entities are included. */
    shouldIncludePlayers: boolean;
    /** Whether to show the structure bounds. */
    shouldShowBoundingBox: boolean;
    /** Current editor mode. */
    structureBlockType: StructureBlockType;
    /** Bounds and placement settings for the structure. */
    structureSettings: StructureSettings;
    /** Where a redstone-triggered save writes the structure. */
    redstoneSaveMode: StructureRedstoneSaveMode;
}

/** The full editor state sent when a player closes a structure block screen. */
export interface StructureBlockUpdate {
    /** Position of the structure block. */
    blockPosition: BlockPos;
    /** Contents of the editor. */
    structureData: StructureEditorData;
    /** Whether to run the structure block immediately. */
    trigger: boolean;
    /** Whether placed blocks are waterlogged. */
    isWaterlogged: boolean;
}

/**
 * Reports the structure block editor state to the server.
 *
 * Protocol 2193 layout: `Block Position`, then `Structure Data` (name, data field, two
 * booleans, mode, {@link StructureSettings}, and redstone save mode), followed by `Trigger?`
 * and `Is Waterlogged`. The redacted structure name is an optional string after its
 * unredacted form. The 2193 reference labels `Redstone Save Mode` as `uint8`; this codec
 * writes the ZigZag varint32 used by the observed wire layout, where `SavesToDisk` is `0x02`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/structure-block-update-packet/
 */
export default class StructureBlockUpdatePacket extends NetworkPacket<StructureBlockUpdate> {
    public get id(): number {
        return PacketIdentifier.STRUCTURE_BLOCK_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StructureBlockUpdate): void {
        data.blockPosition.serialize(stream);
        stream.writeString(data.structureData.structureName.unredacted);
        stream.writeBoolean(data.structureData.structureName.redacted !== null);
        if (data.structureData.structureName.redacted !== null) {
            stream.writeString(data.structureData.structureName.redacted);
        }
        stream.writeString(data.structureData.dataField);
        stream.writeBoolean(data.structureData.shouldIncludePlayers);
        stream.writeBoolean(data.structureData.shouldShowBoundingBox);
        stream.writeVarInt(data.structureData.structureBlockType);
        writeStructureSettings(stream, data.structureData.structureSettings);
        stream.writeVarInt(data.structureData.redstoneSaveMode);
        stream.writeBoolean(data.trigger);
        stream.writeBoolean(data.isWaterlogged);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StructureBlockUpdate {
        const blockPosition = new BlockPos(0, 0, 0);
        blockPosition.deserialize(stream);
        const structureName: RedactableString = {
            unredacted: stream.readString(),
            redacted: stream.readBoolean() ? stream.readString() : null
        };
        const structureData: StructureEditorData = {
            structureName,
            dataField: stream.readString(),
            shouldIncludePlayers: stream.readBoolean(),
            shouldShowBoundingBox: stream.readBoolean(),
            structureBlockType: stream.readVarInt(),
            structureSettings: readStructureSettings(stream),
            redstoneSaveMode: stream.readVarInt()
        };
        const trigger = stream.readBoolean();
        const isWaterlogged = stream.readBoolean();
        return { blockPosition, structureData, trigger, isWaterlogged };
    }
}
