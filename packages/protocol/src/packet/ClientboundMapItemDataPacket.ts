import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundMapItemDataPacket } from '../wire/definitions/clientboundMapItemData';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ClientboundMapItemDataPayload } from '../wire/definitions/clientboundMapItemData';

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
export type MapDecoration = NonNullable<ClientboundMapItemData['decorations']>[number];

/** A map marker the client keeps synchronized to an actor or block actor. */
export type MapItemTrackedActorUniqueId = NonNullable<ClientboundMapItemData['trackedActorIds']>[number];

/** The map identity and optional creation, decoration, and pixel updates. */
export type ClientboundMapItemData = ClientboundMapItemDataPayload;

/**
 * Sends map identity plus any creation ids, decorations, or texture pixels that changed.
 *
 * Protocol 2193 makes each update section independently optional. The client infers the
 * update kind from which presence booleans are set; the former Type bit mask is gone.
 * `Tracked Actor IDs` and `Decorations` are parallel lists. A tracked actor includes
 * optionals for its entity id and block position, while texture updates carry their own
 * width, height, origin, and packed ARGB pixels.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-map-item-data-packet/
 */
export default class ClientboundMapItemDataPacket extends NetworkPacket<ClientboundMapItemData> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_MAP_ITEM_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundMapItemData): void {
        layoutAt(clientboundMapItemDataPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundMapItemData {
        return layoutAt(clientboundMapItemDataPacket, this.codecProtocol).decode(stream);
    }
}
