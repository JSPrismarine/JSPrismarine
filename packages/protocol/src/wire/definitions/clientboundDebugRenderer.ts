/**
 * `ClientboundDebugRendererPacket`: draws one debug cube on the client or clears the markers.
 *
 * Protocol 2193 and 2225 layout (identical): `Type` (string), then an optional `DebugMarkerData`. The presence byte
 * is written for both operations.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-debug-renderer-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields sent to add a debug marker or clear existing markers. */
export const clientboundDebugRendererPacket = definePacket('ClientboundDebugRendererPacket', {
    /** `Type`: the action string the client understands, such as `AddDebugMarkerCube`. */
    type: t.string,
    /** `DebugMarkerData`: the cube to draw, or `null` when the operation has no marker. */
    debugMarkerData: t.optional(
        t.record({
            /** `Text`: the text shown at the marker. */
            text: t.string,
            /** `Position`: where the cube is drawn, as three little-endian floats. */
            position: vec3Structure,
            /** `Color`: the ARGB color, as a little-endian signed int32. */
            color: t.li32,
            /** `Duration`: how long the cube stays visible in milliseconds, as a little-endian uint64. */
            duration: t.lu64
        })
    )
});

/** Payload carried by `ClientboundDebugRendererPacket`. */
export type ClientboundDebugRendererPayload = PayloadOf<typeof clientboundDebugRendererPacket>;
