/**
 * `PositionTrackingDBServerBroadcastPacket`: the answer to a position tracking request.
 *
 * Bound to the client. The wire order at protocol 2193 is Action as a uint8, Id as a
 * `PositionTrackingId` (ZigZag varint32), then Position tracking data as one network NBT
 * compound. The compound holds `version` (byte), `id` (string), `pos` (list of three ints),
 * `dim` (int), and `status` (byte).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/position-tracking-dbserver-broadcast-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { networkNbtCompound } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The result of a position tracking lookup, as the Action uint8 numbers it. */
export enum PositionTrackingDBServerBroadcastAction {
    Update = 0,
    Destroy = 1,
    NotFound = 2
}

/** The fields sent when the server answers a position tracking request. */
export const positionTrackingDBServerBroadcastPacket = definePacket('PositionTrackingDBServerBroadcastPacket', {
    /** `Action`: what became of the tracked position. */
    action: t.enumOf<PositionTrackingDBServerBroadcastAction>(t.uint8),
    /** `Id`: the tracking id the request asked about, as a ZigZag varint32. */
    id: t.varint32,
    /** `Position tracking data`: the record, as one network NBT compound. */
    positionTrackingData: networkNbtCompound
});

/** Payload carried by `PositionTrackingDBServerBroadcastPacket`. */
export type PositionTrackingDBServerBroadcastPayload = PayloadOf<typeof positionTrackingDBServerBroadcastPacket>;
