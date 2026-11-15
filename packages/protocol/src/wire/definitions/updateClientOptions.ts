/**
 * `UpdateClientOptionsPacket`: a change to one of the client settings it first reported in the
 * login connection request.
 *
 * Docs id 323. The 1.26.50 page draws both fields as plain values and its
 * 1.26.60-preview.21 changelog then marks them optional, which `docs/research/protocol-2225-delta.md` reads as the
 * documentation being corrected. The presence bytes are not new:
 * gophertunnel and PocketMine read them at protocol 2193, and the client has written them since
 * the packet appeared.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-client-options-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The client's graphics setting, as `GraphicsMode` numbers it. */
export enum GraphicsMode {
    Simple = 0,
    Fancy = 1,
    Advanced = 2,
    RayTraced = 3
}

/** The `UpdateClientOptionsPacket` field list; the module doc carries the wire provenance. */
export const updateClientOptionsPacket = definePacket('UpdateClientOptionsPacket', {
    /** `Graphics Mode Change`: the new graphics mode, or `null` when it did not change. */
    graphicsMode: t.optional(t.enumOf<GraphicsMode>(t.uint8)),
    /** `Filter Profanity Change`: the new profanity filter setting, or `null` when it did not change. */
    filterProfanity: t.optional(t.bool)
});

/** A change to the graphics mode and the profanity filter, each present only when it changed. */
export type UpdateClientOptionsPayload = PayloadOf<typeof updateClientOptionsPacket>;
