/**
 * `GraphicsOverrideParameterPacket`: a rendering parameter a server script overrides for a
 * biome, optionally for one player.
 *
 * The layout is the same at protocols 2193 and 2225, in the order on Mojang's packet page.
 * `Float Value` and `Vec3 Value` carry a presence byte at both: the 1.26.50 page prints them
 * plain, but the 1.26.60 page marks them optional and its changelog says they "are now
 * optional", which Mojang's note for that build gives as a documentation correction, not a
 * wire change (`docs/research/protocol-2225-delta.md`, "Enum and data changes outside the
 * packet layer"). `Player Identifier` is optional on both pages.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/graphics-override-parameter-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { GraphicsOverrideParameterType } from '../../packet/GraphicsOverrideParameterPacket';
import type { PayloadOf } from '../define';

/** The fields sent when a script overrides one rendering parameter. */
export const graphicsOverrideParameterPacket = definePacket('GraphicsOverrideParameterPacket', {
    /**
     * `Parameter Keyframe Values`: a time of day as a little-endian float, then the value then as
     * a `Vec3`. A color parameter uses all three components; a float, int, or bool parameter uses
     * `x` alone. Empty when the override is a single value.
     */
    keyframeValues: t.list(t.record({ time: t.lf32, value: t.vec3 })),
    /** `Float Value`: a single float override. Absent when the parameter is keyframed or a Vec3. */
    floatValue: t.present(t.lf32),
    /** `Vec3 Value`: a single Vec3 override. Absent when the parameter is keyframed or a float. */
    vec3Value: t.present(t.vec3),
    /** `Biome Identifier`: the biome the override applies to. */
    biomeIdentifier: t.string,
    /** `Player Identifier`: the player the override applies to. Absent for every player. */
    playerIdentifier: t.present(t.string),
    /** `Identifier for Parameter`: which parameter changes, as a uint8. */
    parameter: t.enumOf<GraphicsOverrideParameterType>(t.uint8),
    /** `Reset Parameter`: when true the parameter returns to its default and the values are ignored. */
    resetParameter: t.bool
});

/** Payload carried by `GraphicsOverrideParameterPacket`. */
export type GraphicsOverrideParameterPayload = PayloadOf<typeof graphicsOverrideParameterPacket>;
