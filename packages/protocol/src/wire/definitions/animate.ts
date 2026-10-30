/**
 * `AnimatePacket`: triggers an animation on an actor, in either direction.
 *
 * Field names and order follow the docs' packet page. `Swing Source` is an optional string —
 * a presence byte, then the string — naming what caused a swing; a client writes it in lower
 * case ("none", "build", "mine", "interact", "attack", "useitem", "throwitem", "dropitem",
 * "event"). `Hand` was appended at protocol 2225 as a plain trailing byte with no presence
 * marker, verified against the v1.26.60 `metadata.zip` (`AnimatePacketPayload.json`, ordinal 4)
 * and gophertunnel v1.63.0 (`io.Uint8(&pk.Hand)` last), which agree.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/Animate.html}
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2225 } from '../wireGates';

import type { PayloadOf } from '../define';

/**
 * The `Action` byte.
 *
 * The 1.26.51 docs page prints the members 0 to 4, but that table shows list positions: the
 * page's own 2207 changelog "changes" WakeUp, CriticalHit and MagicCriticalHit to 3, 4 and 5,
 * and gophertunnel and PocketMine have read them so for years. Nothing is 2.
 */
export enum AnimateAction {
    NoAction = 0,
    Swing = 1,
    WakeUp = 3,
    CriticalHit = 4,
    MagicCriticalHit = 5
}

/** The hand animating, byte values on the wire. */
export enum AnimateHand {
    Mainhand = 0,
    Offhand = 1
}

/** The `AnimatePacket` field list; the module doc carries the wire provenance. */
export const animatePacket = definePacket('AnimatePacket', {
    /** `Action`, as the raw byte; see {@link AnimateAction}. */
    action: t.uint8,
    /** `Target Actor Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Data`; meaning depends on the action, zero for the ones that carry nothing. */
    data: t.lf32,
    /** `Swing Source`: what caused the swing, by name, or `null` when absent. */
    swingSource: t.optional(t.string),
    /** `Hand`: which hand is animating; see {@link AnimateHand}. */
    hand: gated<number>(SINCE_2225, t.uint8, AnimateHand.Mainhand)
});

/** What `AnimatePacket` carries, at every version; derived from the field list. */
export type AnimatePayload = PayloadOf<typeof animatePacket>;
