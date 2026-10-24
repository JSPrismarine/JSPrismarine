import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The artwork a {@link MapDecoration} draws, as the Image Type int8 numbers it.
 *
 * The docs end the list with a `Count` sentinel, which is the number of members rather than
 * a decoration anything sends.
 */
export enum MapDecorationType {
    MarkerWhite = 0,
    MarkerGreen = 1,
    MarkerRed = 2,
    MarkerBlue = 3,
    XWhite = 4,
    TriangleRed = 5,
    SquareWhite = 6,
    MarkerSign = 7,
    MarkerPink = 8,
    MarkerOrange = 9,
    MarkerYellow = 10,
    MarkerTeal = 11,
    TriangleGreen = 12,
    SmallSquareWhite = 13,
    Mansion = 14,
    Monument = 15,
    NoDraw = 16,
    VillageDesert = 17,
    VillagePlains = 18,
    VillageSavanna = 19,
    VillageSnowy = 20,
    VillageTaiga = 21,
    JungleTemple = 22,
    WitchHut = 23,
    TrialChambers = 24,
    AbandonedCamp = 25,
    BuriedAncientCity = 26,
    BuriedMineshaft = 27,
    DesertPyramid = 28,
    WarmOceanRuins = 29
}

/**
 * What a tracked map marker follows, as the Type int32 numbers it.
 */
export enum MapItemTrackedActorType {
    Entity = 0,
    BlockEntity = 1,
    Other = 2
}

/** A marker the server places on a map. Its position only changes when the server moves it. */
export interface MapDecoration {
    /** Image Type, the artwork to draw. */
    imageType: MapDecorationType;
    /** Rotation, one of sixteen fixed directions. */
    rotation: number;
    /** X, the offset in pixels across the map. */
    x: number;
    /** Y, the offset in pixels down the map. */
    y: number;
    /** Label, the name shown beside the marker. Any text is accepted. */
    label: string;
    /** Color, packed ARGB written as a big-endian int32. */
    color: number;
}

/** A marker the client keeps up to date itself by following an actor or a block actor. */
export interface MapItemTrackedActorUniqueId {
    /** Type, what the marker follows. */
    type: MapItemTrackedActorType;
    /** Entity ID, present when Type is `Entity`. */
    entityId: bigint | null;
    /** Block Position, present when Type is `BlockEntity`. */
    blockPosition: BlockPosition | null;
}

/**
 * Updates one map item: the maps it belongs to, its markers, or its pixels.
 *
 * **Bound To:** Client
 *
 * Every field after Map Origin is optional, and which ones are present says what kind of
 * update this is. Creation sends Creation Map IDs, a decoration update sends Tracked Actor
 * IDs with Decorations beside it, and a texture update sends the four region bounds with
 * Pixels. An update may carry a part of the map rather than all of it.
 *
 * Protocol 2193 layout (docs id 67), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Map ID | varint64 | |
 * | Dimension | uint8 | |
 * | Is Locked | boolean | Set by a cartography table |
 * | Map Origin | BlockPos | The center of the map |
 * | Creation Map IDs | optional ActorUniqueID[] | The larger maps this one is part of |
 * | Scale | optional int8 | |
 * | Tracked Actor IDs | optional MapItemTrackedActorUniqueId[] | Paired with Decorations |
 * | Decorations | optional MapDecoration[] | |
 * | Width | optional varint32 | |
 * | Height | optional varint32 | |
 * | Start X | optional varint32 | |
 * | Start Y | optional varint32 | |
 * | Pixels | optional uint32[] | ARGB, each written big-endian |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/clientbound-map-item-data-packet/
 */
export default class ClientboundMapItemDataPacket extends DataPacket {
    public static NetID = Identifiers.ClientboundMapItemDataPacket;

    /** Map ID, which stays the same across sessions of one world. */
    public mapId = 0n;

    /** Dimension the map was drawn in. */
    public dimension = 0;

    /** Is Locked, set once a cartography table locks the map. */
    public isLocked = false;

    /** Map Origin, the block at the center of the map. */
    public mapOrigin: BlockPosition = new BlockPosition(0, 0, 0);

    /**
     * Creation Map IDs, the ids of the larger scale maps this one is part of. A scale 0 map
     * belongs to five, a scale 4 map only to itself.
     */
    public creationMapIds: bigint[] | null = null;

    /** Scale, from 0 for the most detailed map to 4 for the widest. */
    public scale: number | null = null;

    /** Tracked Actor IDs, one entry per entry of Decorations. */
    public trackedActorIds: MapItemTrackedActorUniqueId[] | null = null;

    /** Decorations, the markers drawn on the map. */
    public decorations: MapDecoration[] | null = null;

    /** Width of the updated pixel region. */
    public width: number | null = null;

    /** Height of the updated pixel region. */
    public height: number | null = null;

    /** Start X, where the updated pixel region begins across the map. */
    public startX: number | null = null;

    /** Start Y, where the updated pixel region begins down the map. */
    public startY: number | null = null;

    /** Pixels of the updated region, row by row, each a packed ARGB value. */
    public pixels: number[] | null = null;

    /** Reads the map's identity and whichever optional blocks the update carries. */
    public decodePayload(): void {
        this.mapId = this.readVarLong();
        this.dimension = this.readByte();
        this.isLocked = this.readBoolean();
        this.mapOrigin = NetworkUtil.readBlockPosition(this);

        this.creationMapIds = this.readBoolean() ? this.readList(() => this.readVarLong()) : null;
        this.scale = this.readBoolean() ? this.readSignedByte() : null;
        this.trackedActorIds = this.readBoolean() ? this.readList(() => this.readTrackedActor()) : null;
        this.decorations = this.readBoolean() ? this.readList(() => this.readDecoration()) : null;
        this.width = this.readBoolean() ? this.readVarInt() : null;
        this.height = this.readBoolean() ? this.readVarInt() : null;
        this.startX = this.readBoolean() ? this.readVarInt() : null;
        this.startY = this.readBoolean() ? this.readVarInt() : null;
        this.pixels = this.readBoolean() ? this.readList(() => this.readUnsignedInt()) : null;
    }

    /** Writes the map's identity and whichever optional blocks are set. */
    public encodePayload(): void {
        this.writeVarLong(this.mapId);
        this.writeByte(this.dimension);
        this.writeBoolean(this.isLocked);
        NetworkUtil.writeBlockPosition(this, this.mapOrigin);

        this.writeOptionalList(this.creationMapIds, (id) => this.writeVarLong(id));
        this.writeOptional(this.scale, (scale) => this.writeSignedByte(scale));
        this.writeOptionalList(this.trackedActorIds, (tracked) => this.writeTrackedActor(tracked));
        this.writeOptionalList(this.decorations, (decoration) => this.writeDecoration(decoration));
        this.writeOptional(this.width, (width) => this.writeVarInt(width));
        this.writeOptional(this.height, (height) => this.writeVarInt(height));
        this.writeOptional(this.startX, (startX) => this.writeVarInt(startX));
        this.writeOptional(this.startY, (startY) => this.writeVarInt(startY));
        this.writeOptionalList(this.pixels, (pixel) => this.writeUnsignedInt(pixel));
    }

    private readList<T>(readEntry: () => T): T[] {
        const count = this.readUnsignedVarInt();

        const entries: T[] = [];
        for (let i = 0; i < count; i++) entries.push(readEntry());
        return entries;
    }

    private readTrackedActor(): MapItemTrackedActorUniqueId {
        return {
            type: this.readIntLE(),
            entityId: this.readBoolean() ? this.readVarLong() : null,
            blockPosition: this.readBoolean() ? NetworkUtil.readBlockPosition(this) : null
        };
    }

    private readDecoration(): MapDecoration {
        return {
            imageType: this.readSignedByte(),
            rotation: this.readByte(),
            x: this.readByte(),
            y: this.readByte(),
            label: NetworkUtil.readString(this),
            color: this.readInt()
        };
    }

    private writeOptional<T>(value: T | null, writeValue: (value: T) => void): void {
        this.writeBoolean(value !== null);
        if (value !== null) writeValue(value);
    }

    private writeOptionalList<T>(entries: T[] | null, writeEntry: (entry: T) => void): void {
        this.writeOptional(entries, (present) => {
            this.writeUnsignedVarInt(present.length);
            for (const entry of present) writeEntry(entry);
        });
    }

    private writeTrackedActor(tracked: MapItemTrackedActorUniqueId): void {
        this.writeIntLE(tracked.type);
        this.writeOptional(tracked.entityId, (entityId) => this.writeVarLong(entityId));
        this.writeOptional(tracked.blockPosition, (position) => NetworkUtil.writeBlockPosition(this, position));
    }

    private writeDecoration(decoration: MapDecoration): void {
        this.writeSignedByte(decoration.imageType);
        this.writeByte(decoration.rotation);
        this.writeByte(decoration.x);
        this.writeByte(decoration.y);
        NetworkUtil.writeString(this, decoration.label);
        this.writeInt(decoration.color);
    }
}
