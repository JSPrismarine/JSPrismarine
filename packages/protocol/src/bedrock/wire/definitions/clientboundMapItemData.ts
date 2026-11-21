/**
 * `ClientboundMapItemDataPacket`: sends a map's identity and any sections that changed.
 *
 * Protocol 2193 makes each update section independently optional: every section is a presence
 * byte followed by its value when set. The `Tracked Actor IDs` and `Decorations` lists are
 * parallel, and a texture update carries its own width, height, origin, and packed ARGB pixels.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-map-item-data-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { MapDecorationType, MapItemTrackedActorType } from '../../packet/ClientboundMapItemDataPacket';
import type { PayloadOf } from '../../../wire/define';

/** One marker drawn on the map: its artwork, rotation, pixel offset, label, and ARGB color. */
const mapDecoration = t.record({
    /** `Image Type`: the artwork, as a signed byte. */
    imageType: t.enumOf<MapDecorationType>(t.int8),
    /** `Rotation`: the direction, in one of sixteen steps. */
    rotation: t.uint8,
    /** `X`: the pixel offset across the map. */
    x: t.uint8,
    /** `Y`: the pixel offset down the map. */
    y: t.uint8,
    /** `Label`: the text displayed beside the marker. */
    label: t.string,
    /** `Color`: the packed ARGB value as a little-endian int32. */
    color: t.li32
});

/** One tracked actor: what the marker follows, with its entity id or block position. */
const mapTrackedActor = t.record({
    /** `Type`: the kind of object the marker follows, as a little-endian int32. */
    type: t.enumOf<MapItemTrackedActorType>(t.li32),
    /** `Entity ID`: the followed entity, present for an entity marker. */
    entityId: t.optional(t.varint64),
    /** `Block Position`: the followed block actor, present for a block marker. */
    blockPosition: t.optional(blockPosStructure)
});

/** The fields sent to create or update one map on the client. */
export const clientboundMapItemDataPacket = definePacket('ClientboundMapItemDataPacket', {
    /** `Map ID`: the stable id of the map item, a ZigZag varint64. */
    mapId: t.varint64,
    /** `Dimension`: the dimension the map covers, one unsigned byte. */
    dimension: t.uint8,
    /** `Is Locked`: whether a cartography table has locked the map. */
    isLocked: t.bool,
    /** `Map Origin`: the block at the center of the map. */
    mapOrigin: blockPosStructure,
    /** `Creation Map IDs`: the ids of newly created maps, present only for a creation update. */
    creationMapIds: t.optional(t.list(t.varint64)),
    /** `Scale`: the zoom level as a signed byte, when provided. */
    scale: t.optional(t.int8),
    /** `Tracked Actor IDs`: the actors the client tracks for the decorations, when provided. */
    trackedActorIds: t.optional(t.list(mapTrackedActor)),
    /** `Decorations`: the markers to draw, when provided. */
    decorations: t.optional(t.list(mapDecoration)),
    /** `Width`: the width of the pixel region, when a texture update is sent. */
    width: t.optional(t.varint32),
    /** `Height`: the height of the pixel region, when a texture update is sent. */
    height: t.optional(t.varint32),
    /** `Start X`: the first pixel column of the texture update, when present. */
    startX: t.optional(t.varint32),
    /** `Start Y`: the first pixel row of the texture update, when present. */
    startY: t.optional(t.varint32),
    /** `Pixels`: the packed ARGB pixels in row order, each a little-endian uint32, when sent. */
    pixels: t.optional(t.list(t.lu32))
});

/** Payload carried by `ClientboundMapItemDataPacket`. */
export type ClientboundMapItemDataPayload = PayloadOf<typeof clientboundMapItemDataPacket>;
