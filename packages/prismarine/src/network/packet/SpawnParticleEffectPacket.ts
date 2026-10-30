import { Vector3 } from '@jsprismarine/math';
import { layoutAt, spawnParticleEffectPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Plays a named particle effect, including ones that only a behavior pack knows about.
 *
 * The `/particle` command and the script spawn-particle events are what still use it; the
 * hardcoded effects go through `LevelEventPacket` instead. An unknown Effect Name is a no-op
 * on the client rather than an error.
 *
 * **Bound To:** Client
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `spawnParticleEffectPacket` definition:
 * `Dimension Id` as a byte, `Actor Id` as a ZigZag varint64, `Position` as three little-endian
 * floats, `Effect Name` as a string, then `Molang Variables` as a presence byte followed by a
 * string when the byte is set.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/spawn-particle-effect-packet/
 */
export default class SpawnParticleEffectPacket extends FieldNetworkPacket {
    /** Dimension the effect belongs to. */
    public dimensionId = 0;

    /** Actor the particle hangs off, or -1 for a particle standing on its own. */
    public actorId = -1n;

    /** Where the particle appears, relative to the actor when `actorId` is not -1. */
    public position = new Vector3(0, 0, 0);

    /** Identifier of the effect, such as `minecraft:heart_particle`. */
    public effectName = '';

    /**
     * Molang variables for the effect, as the JSON map the client reads them from.
     *
     * Left out in almost every case. The docs mark the field present at 2193 and optional from
     * 2207, but gophertunnel writes the presence byte at 2193 and a client reads one, so it is
     * written here.
     */
    public molangVariables?: string;

    /** Reads the dimension, the actor, the position, the effect name and the variables. */
    public decodePayload(): void {
        const payload = layoutAt(spawnParticleEffectPacket, this.codecProtocol).decode(this);

        this.dimensionId = payload.dimensionId;
        this.actorId = payload.actorId;
        this.position = payload.position;
        this.effectName = payload.effectName;
        this.molangVariables = payload.molangVariables ?? undefined;
    }

    /** Writes the dimension, the actor, the position, the effect name and the variables. */
    public encodePayload(): void {
        layoutAt(spawnParticleEffectPacket, this.codecProtocol).encode(this, {
            dimensionId: this.dimensionId,
            actorId: this.actorId,
            position: this.position,
            effectName: this.effectName,
            molangVariables: this.molangVariables ?? null
        });
    }
}
