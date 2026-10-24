import { Vector3 } from '@jsprismarine/math';
import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** Which of the six structure block modes the block is in, as `StructureBlockType` numbers them. */
export enum StructureBlockType {
    Data = 0,
    Save = 1,
    Load = 2,
    Corner = 3,
    Invalid = 4,
    Export = 5
}

/**
 * How far the structure is turned when it is placed, as `Rotation` numbers it.
 *
 * The docs also list `Clockwise90`, `Clockwise180` and `CounterClockwise90` under this enum.
 * They are other names for 1, 2 and 3, which the page's own 2207 changelog confirms by
 * renumbering them from the list indices 4, 5 and 6.
 */
export enum Rotation {
    None = 0,
    Rotate90 = 1,
    Rotate180 = 2,
    Rotate270 = 3
}

/** Which axes the structure is flipped over, as `Mirror` numbers them. */
export enum Mirror {
    None = 0,
    X = 1,
    Z = 2,
    XZ = 3
}

/** How a loaded structure animates into place, as `AnimationMode` numbers it. */
export enum AnimationMode {
    None = 0,
    Layers = 1,
    Blocks = 2
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

/** The structure block's export settings, Mojang's `StructureSettings`. */
export interface StructureSettings {
    /** The block palette to use. Vanilla has only sent "default" so far. */
    structurePaletteName: string;

    /** True leaves actors out of the structure. */
    ignoreEntities: boolean;

    /** True leaves blocks out of the structure. */
    ignoreBlocks: boolean;

    /** True lets the structure cover chunks that are not ticking. */
    allowNonTickingChunks: boolean;

    /** How far the area reaches from its start, in blocks. */
    structureSize: BlockPosition;

    /** Where the area starts, relative to the structure block. */
    structureOffset: BlockPosition;

    /** The player who last changed these settings. */
    lastEditPlayer: bigint;

    rotation: Rotation;
    mirror: Mirror;
    animationMode: AnimationMode;

    /** How long the placement animation takes, in seconds. */
    animationSeconds: number;

    /** The share of blocks to keep, from 0 to 1. Which ones are dropped follows the seed. */
    integrityValue: number;

    /** The seed that picks the dropped blocks. 0 means a random one. */
    integritySeed: number;

    /** The point the structure turns around. */
    rotationPivot: Vector3;
}

/** The contents of the structure block screen, Mojang's `StructureEditorData`. */
export interface StructureEditorData {
    /** The name the structure saves and loads under. */
    structureName: RedactableString;

    /** The name of a function to run on load, used during world generation. */
    dataField: string;

    /** True exports players standing in the area. */
    includePlayers: boolean;

    /** True outlines the area with a thin box. */
    showBoundingBox: boolean;

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
 * `Redstone Save Mode` as a ZigZag varint32. The settings are the palette name, three flag
 * bytes, the size and offset as block positions, the last editor as a ZigZag varint64, the
 * rotation, mirror and animation mode bytes, the animation seconds and integrity as floats
 * LE, the integrity seed as a uint32 LE, and the pivot as three floats LE.
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
export default class StructureBlockUpdatePacket extends DataPacket {
    public static NetID = Identifiers.StructureBlockUpdatePacket;

    /** Where the structure block is. */
    public blockPosition: BlockPosition = new BlockPosition(0, 0, 0);

    public structureData: StructureEditorData = {
        structureName: { unredacted: '', redacted: null },
        dataField: '',
        includePlayers: false,
        showBoundingBox: false,
        structureBlockType: StructureBlockType.Data,
        structureSettings: {
            structurePaletteName: 'default',
            ignoreEntities: false,
            ignoreBlocks: false,
            allowNonTickingChunks: false,
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
        },
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
            includePlayers: this.readBoolean(),
            showBoundingBox: this.readBoolean(),
            structureBlockType: this.readVarInt(),
            structureSettings: {
                structurePaletteName: NetworkUtil.readString(this),
                ignoreEntities: this.readBoolean(),
                ignoreBlocks: this.readBoolean(),
                allowNonTickingChunks: this.readBoolean(),
                structureSize: NetworkUtil.readBlockPosition(this),
                structureOffset: NetworkUtil.readBlockPosition(this),
                lastEditPlayer: this.readVarLong(),
                rotation: this.readByte(),
                mirror: this.readByte(),
                animationMode: this.readByte(),
                animationSeconds: this.readFloatLE(),
                integrityValue: this.readFloatLE(),
                integritySeed: this.readUnsignedIntLE(),
                rotationPivot: NetworkUtil.readVector3(this)
            },
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
        this.writeBoolean(this.structureData.includePlayers);
        this.writeBoolean(this.structureData.showBoundingBox);
        this.writeVarInt(this.structureData.structureBlockType);

        NetworkUtil.writeString(this, structureSettings.structurePaletteName);
        this.writeBoolean(structureSettings.ignoreEntities);
        this.writeBoolean(structureSettings.ignoreBlocks);
        this.writeBoolean(structureSettings.allowNonTickingChunks);
        NetworkUtil.writeBlockPosition(this, structureSettings.structureSize);
        NetworkUtil.writeBlockPosition(this, structureSettings.structureOffset);
        this.writeVarLong(structureSettings.lastEditPlayer);
        this.writeByte(structureSettings.rotation);
        this.writeByte(structureSettings.mirror);
        this.writeByte(structureSettings.animationMode);
        this.writeFloatLE(structureSettings.animationSeconds);
        this.writeFloatLE(structureSettings.integrityValue);
        this.writeUnsignedIntLE(structureSettings.integritySeed);
        NetworkUtil.writeVector3(this, structureSettings.rotationPivot);

        this.writeVarInt(this.structureData.redstoneSaveMode);
        this.writeBoolean(this.trigger);
        this.writeBoolean(this.isWaterlogged);
    }
}
