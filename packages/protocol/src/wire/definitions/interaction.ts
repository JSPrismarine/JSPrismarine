/**
 * What a client did to an actor it was pointing at.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vector3 } from '../structureTypes';

import type { PayloadOf } from '../define';

/**
 * The `InteractPacket` field list.
 *
 * `Position` is an optional: a presence byte, then three little-endian floats when set. Only
 * the mouse-over and the leave-vehicle actions carry one.
 */
export const interactPacket = definePacket('InteractPacket', {
    /** `Action`: what the client did, an `InteractAction`. */
    action: t.uint8,
    /** `Target Runtime ID`: the actor interacted with. */
    target: t.varuint64,
    /** `Position`. */
    position: t.optional(vector3)
});

/** Reports a client interaction action, its target actor, and any action-specific position. */
export type InteractPayload = PayloadOf<typeof interactPacket>;
