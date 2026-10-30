import BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';
import type { StructureSettings } from '../type/StructureSettings';
import { defaultStructureSettings, readStructureSettings, writeStructureSettings } from '../type/StructureSettings';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** Which of the six structure block modes the block is in, as `StructureBlockType` numbers them. */
export enum StructureBlockType {
    Data = 0,
    Save = 1,
    Load = 2,
    Corner = 3,
    Invalid = 4,
    Export = 5
}

/** Where a redstone-triggered save goes, as `StructureRedstoneSaveMode` numbers it. */
export enum StructureRedstoneSaveMode {
    SavesToMemory = 0,
    SavesToDisk = 1
}

/**
 * A string the client may hold twice, Mojang's `Bedrock::Safety::RedactableString`.
 *
 * The unredacted text is always written. The redacted form has a presence byte and is only
 * sent when the text was filtered.
 */
export interface RedactableString {
    /** The text as it was typed. */
    unredacted: string;

    /** The filtered text, or null when the field is absent. */
    redacted: string | null;
}

/**
 * The docs' `StructureEditorData`: the contents of the structure block screen.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/structure-editor-data/
 */
export interface StructureEditorData {
    /** `Structure Name`: the name the structure saves and loads under. */
    structureName: RedactableString;

    /** `Data Field`: the name of a function to run on load, used during world generation. */
    dataField: string;

    /** `Should include players?`: true exports players standing in the area. */
    shouldIncludePlayers: boolean;

    /** `Should show bounding box?`: true outlines the area with a thin box. */
    shouldShowBoundingBox: boolean;

    structureBlockType: StructureBlockType;
    structureSettings: StructureSettings;
    redstoneSaveMode: StructureRedstoneSaveMode;
}

/**
 * The structure block screen as the client left it, sent once when the screen closes.
 *
 * Wire order at protocol 2193: `Block Position` as three ZigZag varint32, `Structure Data` as
 * a {@link StructureEditorData}, then `Trigger?` and `IsWaterlogged` as one byte each.
 *
 * `Structure Data` is the structure name as a {@link RedactableString}, `Data Field` as a
 * string, the `Should include players?` and `Should show bounding box?` bytes,
 * `Structure Block Type` as a ZigZag varint32, the {@link StructureSettings}, then
 * `Redstone Save Mode` as a ZigZag varint32. {@link StructureSettings} lists its own layout.
 *
 * The docs mark `Redstone Save Mode` as a compressed `uint8`, which is a varint; PocketMine
 * reads it as a signed one, so `SavesToDisk` is the byte 0x02, not 0x01. `Structure Name` is
 * a `RedactableString` whose `Redacted` half the docs mark optional, so it carries a presence
 * byte like the optional filtered message of `TextPacket`. gophertunnel reads it as a second
 * plain string; the two agree whenever no redacted name is present, which is every packet
 * seen so far.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/structure-block-update-packet/
 */
export default class StructureBlockUpdatePacket extends FieldNetworkPacket {
    /** Where the structure block is. */
    public blockPosition: BlockPosition = new BlockPosition(0, 0, 0);

    public structureData: StructureEditorData = {
        structureName: { unredacted: '', redacted: null },
        dataField: '',
        shouldIncludePlayers: false,
        shouldShowBoundingBox: false,
        structureBlockType: StructureBlockType.Data,
        structureSettings: defaultStructureSettings(),
        redstoneSaveMode: StructureRedstoneSaveMode.SavesToMemory
    };

    /** True runs the structure block as soon as the server reads the packet. */
    public trigger = false;

    /** True places blocks into water instead of replacing it. */
    public isWaterlogged = false;

    /** Reads the block position, the whole editor screen, and the two trailing flags. */
    public decodePayload(): void {
        this.blockPosition = NetworkUtil.readBlockPosition(this);

        const structureName: RedactableString = {
            unredacted: NetworkUtil.readString(this),
            redacted: null
        };
        structureName.redacted = this.readBoolean() ? NetworkUtil.readString(this) : null;

        this.structureData = {
            structureName,
            dataField: NetworkUtil.readString(this),
            shouldIncludePlayers: this.readBoolean(),
            shouldShowBoundingBox: this.readBoolean(),
            structureBlockType: this.readVarInt(),
            structureSettings: readStructureSettings(this),
            redstoneSaveMode: this.readVarInt()
        };

        this.trigger = this.readBoolean();
        this.isWaterlogged = this.readBoolean();
    }

    /** Writes the block position, the whole editor screen, and the two trailing flags. */
    public encodePayload(): void {
        NetworkUtil.writeBlockPosition(this, this.blockPosition);

        const { structureName, structureSettings } = this.structureData;
        NetworkUtil.writeString(this, structureName.unredacted);
        this.writeBoolean(structureName.redacted !== null);
        if (structureName.redacted !== null) NetworkUtil.writeString(this, structureName.redacted);

        NetworkUtil.writeString(this, this.structureData.dataField);
        this.writeBoolean(this.structureData.shouldIncludePlayers);
        this.writeBoolean(this.structureData.shouldShowBoundingBox);
        this.writeVarInt(this.structureData.structureBlockType);
        writeStructureSettings(this, structureSettings);
        this.writeVarInt(this.structureData.redstoneSaveMode);
        this.writeBoolean(this.trigger);
        this.writeBoolean(this.isWaterlogged);
    }
}
