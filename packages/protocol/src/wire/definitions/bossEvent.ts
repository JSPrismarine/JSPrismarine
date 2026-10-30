/**
 * The boss bar at the top of a player's screen.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/boss-event-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * The `BossEventPacket` field list.
 *
 * Every field travels whatever the `Event Type` is. Up to protocol 2192 the packet also
 * carried a `Player ID` between the target and the event type, and only wrote the fields the
 * event type used. A reader that still expects that layout takes the event type for the first
 * byte of a ZigZag `Player ID` and misreads the rest of the packet.
 */
export const bossEventPacket = definePacket('BossEventPacket', {
    /** `Target Actor ID`: the client reads the bar's health and name tag from this actor. */
    targetActorId: t.varint64,
    /** `Event Type`: a `BossEventUpdateType`. */
    eventType: t.uint8,
    /** `Name`: the title shown above the bar. */
    name: t.string,
    /** `FilteredName`: the title for a player with the profanity filter on. */
    filteredName: t.string,
    /** `Health Percent`: how full the bar is, from 0 to 1. */
    healthPercent: t.lf32,
    /** `Color`: a `BossBarColor`. */
    color: t.uint8,
    /** `Overlay`: a `BossBarOverlay`, how the bar is divided. */
    overlay: t.uint8
});

/** Updates a boss bar's target actor, title, health, color, and overlay. */
export type BossEventPayload = PayloadOf<typeof bossEventPacket>;
