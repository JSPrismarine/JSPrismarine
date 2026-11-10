/**
 * `AnimateEntityPacket`: Plays an animation controller on a list of actors.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `AnimateEntityPacket` field list. */
export const animateEntityPacket = definePacket('AnimateEntityPacket', {
    /** `Animation`: the animation to play. */
    animation: t.string,
    /** `Next State`: the state the controller moves to. */
    nextState: t.string,
    /** `Stop Expression`: the Molang expression that ends the animation. */
    stopExpression: t.string,
    /** `Stop Expression Version`: the Molang version the expression was written for. */
    stopExpressionVersion: t.li32,
    /** `Controller`: the animation controller name. */
    controller: t.string,
    /** `Blend Out Time`: seconds to blend out. */
    blendOutTime: t.lf32,
    /** `Runtime Entity IDs`: the actors that play it. */
    runtimeIds: t.list(t.varuint64)
});

/** Plays an animation controller on a list of actors. */
export type AnimateEntityPayload = PayloadOf<typeof animateEntityPacket>;
