/**
 * Client visual effects that are not actor metadata: a full-screen texture animation and a
 * named particle effect attached to an actor or placed at a position. Field names and order
 * follow each packet's docs page.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/on-screen-texture-animation-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/spawn-particle-effect-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vector3 } from '../structureTypes';

import type { PayloadOf } from '../define';

/**
 * The `OnScreenTextureAnimationPacket` field list: a full-screen texture animation, such as
 * the flash when a totem of undying fires.
 *
 * `Effect Id` is a little-endian uint32 rather than a varint, and it is the whole payload.
 */
export const onScreenTextureAnimationPacket = definePacket('OnScreenTextureAnimationPacket', {
    /** `Effect Id`: which animation to play. */
    animationType: t.lu32
});

/** Selects the full-screen texture animation the client should play. */
export type OnScreenTextureAnimationPayload = PayloadOf<typeof onScreenTextureAnimationPacket>;

/**
 * The `SpawnParticleEffectPacket` field list: a named particle effect, including ones only a
 * behavior pack knows about.
 *
 * The `/particle` command and the script spawn-particle events are what still use it; the
 * hardcoded effects go through `LevelEventPacket` instead. An unknown `Effect Name` is a
 * no-op on the client rather than an error.
 */
export const spawnParticleEffectPacket = definePacket('SpawnParticleEffectPacket', {
    /** `Dimension Id`: which dimension the effect belongs to. */
    dimensionId: t.uint8,
    /** `Actor Id`: the actor the particle hangs off, or -1 for one standing on its own. */
    actorId: t.varint64,
    /** `Position`: where the particle appears, relative to the actor unless `actorId` is -1. */
    position: vector3,
    /** `Effect Name`: the identifier, such as `minecraft:heart_particle`. */
    effectName: t.string,
    /**
     * `Molang Variables`: the JSON map the client reads the effect's variables from, left out
     * in almost every case. The 1.26.50 page prints the field plain and the 1.26.60 page
     * optional; Mojang's note says that change corrects the documentation, so the presence
     * byte is on the wire at both protocol versions.
     * See `docs/research/protocol-2225-delta.md`.
     */
    molangVariables: t.optional(t.string)
});

/** Spawns a named particle effect at a position or relative to an actor. */
export type SpawnParticleEffectPayload = PayloadOf<typeof spawnParticleEffectPacket>;
