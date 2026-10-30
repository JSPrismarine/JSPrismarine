import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The artwork drawn for a map decoration, sent as an int8. */
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

/** What a map decoration follows, as a little-endian int32. */
export enum MapItemTrackedActorType {
    Entity = 0,
    BlockEntity = 1,
    Other = 2
}

/** A marker drawn on a map. */
export interface MapDecoration {
    /** Artwork used for the marker. */
    imageType: MapDecorationType;
    /** Direction, in one of sixteen steps. */
    rotation: number;
    /** Pixel offset across the map. */
    x: number;
    /** Pixel offset down the map. */
    y: number;
    /** Text displayed beside the marker. */
    label: string;
    /** Packed ARGB color written as a little-endian int32. */
    color: number;
}

/** A map marker the client keeps synchronized to an actor or block actor. */
export interface MapItemTrackedActorUniqueId {
    /** Kind of object the marker follows. */
    type: MapItemTrackedActorType;
    /** Entity id for an entity marker, otherwise `null`. */
    entityId: bigint | null;
    /** Block position for a block actor marker, otherwise `null`. */
    blockPosition: BlockPos | null;
}

/** The map identity and optional creation, decoration, and pixel updates. */
export interface ClientboundMapItemData {
    /** Stable id of the map item. */
    mapId: bigint;
    /** Dimension the map covers. */
    dimension: number;
    /** Whether a cartography table has locked the map. */
    isLocked: boolean;
    /** Block at the center of the map. */
    mapOrigin: BlockPos;
    /** Larger scale maps that contain this map, or `null` when not provided. */
    creationMapIds: bigint[] | null;
    /** Map zoom level, or `null` when not provided. */
    scale: number | null;
    /** Actor ids the client tracks for the decorations, or `null` when not provided. */
    trackedActorIds: MapItemTrackedActorUniqueId[] | null;
    /** Markers to draw, or `null` when not provided. */
    decorations: MapDecoration[] | null;
    /** Width of the pixel region, or `null` when no texture update is sent. */
    width: number | null;
    /** Height of the pixel region, or `null` when no texture update is sent. */
    height: number | null;
    /** First pixel column of the texture update, or `null` when absent. */
    startX: number | null;
    /** First pixel row of the texture update, or `null` when absent. */
    startY: number | null;
    /** Packed ARGB pixels in row order, or `null` when no texture update is sent. */
    pixels: number[] | null;
}

/**
 * Sends map identity plus any creation ids, decorations, or texture pixels that changed.
 *
 * Protocol 2193 makes each update section independently optional. The client infers the
 * update kind from which presence booleans are set; the former Type bit mask is gone.
 * `Tracked Actor IDs` and `Decorations` are parallel lists. A tracked actor includes
 * optionals for its entity id and block position, while texture updates carry their own
 * width, height, origin, and packed ARGB pixels.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/clientbound-map-item-data-packet/
 */
export default class ClientboundMapItemDataPacket extends NetworkPacket<ClientboundMapItemData> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_MAP_ITEM_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundMapItemData): void {
        stream.writeVarLong(data.mapId);
        stream.writeByte(data.dimension);
        stream.writeBoolean(data.isLocked);
        data.mapOrigin.serialize(stream);

        this.writeOptionalList(stream, data.creationMapIds, (id) => stream.writeVarLong(id));
        this.writeOptional(stream, data.scale, (scale) => stream.writeSignedByte(scale));
        this.writeOptionalList(stream, data.trackedActorIds, (tracked) => this.writeTrackedActor(stream, tracked));
        this.writeOptionalList(stream, data.decorations, (decoration) => this.writeDecoration(stream, decoration));
        this.writeOptional(stream, data.width, (width) => stream.writeVarInt(width));
        this.writeOptional(stream, data.height, (height) => stream.writeVarInt(height));
        this.writeOptional(stream, data.startX, (startX) => stream.writeVarInt(startX));
        this.writeOptional(stream, data.startY, (startY) => stream.writeVarInt(startY));
        this.writeOptionalList(stream, data.pixels, (pixel) => stream.writeUnsignedIntLE(pixel));
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundMapItemData {
        const mapId = stream.readVarLong();
        const dimension = stream.readByte();
        const isLocked = stream.readBoolean();
        const mapOrigin = new BlockPos(0, 0, 0);
        mapOrigin.deserialize(stream);

        return {
            mapId,
            dimension,
            isLocked,
            mapOrigin,
            creationMapIds: this.readOptionalList(stream, () => stream.readVarLong()),
            scale: this.readOptional(stream, () => stream.readSignedByte()),
            trackedActorIds: this.readOptionalList(stream, () => this.readTrackedActor(stream)),
            decorations: this.readOptionalList(stream, () => this.readDecoration(stream)),
            width: this.readOptional(stream, () => stream.readVarInt()),
            height: this.readOptional(stream, () => stream.readVarInt()),
            startX: this.readOptional(stream, () => stream.readVarInt()),
            startY: this.readOptional(stream, () => stream.readVarInt()),
            pixels: this.readOptionalList(stream, () => stream.readUnsignedIntLE())
        };
    }

    private readOptional<T>(stream: NetworkBinaryStream, readValue: () => T): T | null {
        return stream.readBoolean() ? readValue() : null;
    }

    private readOptionalList<T>(stream: NetworkBinaryStream, readValue: () => T): T[] | null {
        return this.readOptional(stream, () => {
            const entries: T[] = [];
            for (let count = stream.readUnsignedVarInt(); count > 0; count--) entries.push(readValue());
            return entries;
        });
    }

    private writeOptional<T>(stream: NetworkBinaryStream, value: T | null, writeValue: (value: T) => void): void {
        stream.writeBoolean(value !== null);
        if (value !== null) writeValue(value);
    }

    private writeOptionalList<T>(
        stream: NetworkBinaryStream,
        entries: T[] | null,
        writeEntry: (entry: T) => void
    ): void {
        this.writeOptional(stream, entries, (present) => {
            stream.writeUnsignedVarInt(present.length);
            for (const entry of present) writeEntry(entry);
        });
    }

    private readTrackedActor(stream: NetworkBinaryStream): MapItemTrackedActorUniqueId {
        return {
            type: stream.readIntLE(),
            entityId: this.readOptional(stream, () => stream.readVarLong()),
            blockPosition: this.readOptional(stream, () => {
                const position = new BlockPos(0, 0, 0);
                position.deserialize(stream);
                return position;
            })
        };
    }

    private writeTrackedActor(stream: NetworkBinaryStream, tracked: MapItemTrackedActorUniqueId): void {
        stream.writeIntLE(tracked.type);
        this.writeOptional(stream, tracked.entityId, (entityId) => stream.writeVarLong(entityId));
        this.writeOptional(stream, tracked.blockPosition, (position) => position.serialize(stream));
    }

    private readDecoration(stream: NetworkBinaryStream): MapDecoration {
        return {
            imageType: stream.readSignedByte(),
            rotation: stream.readByte(),
            x: stream.readByte(),
            y: stream.readByte(),
            label: stream.readString(),
            color: stream.readIntLE()
        };
    }

    private writeDecoration(stream: NetworkBinaryStream, decoration: MapDecoration): void {
        stream.writeSignedByte(decoration.imageType);
        stream.writeByte(decoration.rotation);
        stream.writeByte(decoration.x);
        stream.writeByte(decoration.y);
        stream.writeString(decoration.label);
        stream.writeIntLE(decoration.color);
    }
}
