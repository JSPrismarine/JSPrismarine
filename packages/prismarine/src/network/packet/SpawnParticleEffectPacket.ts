import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Plays a named particle effect, including ones that only a behavior pack knows about.
 *
 * The `/particle` command and the script spawn-particle events are what still use it; the
 * hardcoded effects go through `LevelEventPacket` instead. An unknown Effect Name is a no-op
 * on the client rather than an error.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Dimension Id as a byte, Actor Id as a ZigZag varint64,
 * Position as three floats LE, Effect Name as a string, then Molang Variables as an optional
 * string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/spawn-particle-effect-packet/
 */
export default class SpawnParticleEffectPacket extends DataPacket {
    public static NetID = Identifiers.SpawnParticleEffectPacket;

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
     * Left out entirely in almost every case. The docs mark the field present at 2193 and
     * optional from 2207, but gophertunnel writes the presence byte at 2193 and a client reads
     * one, so it is written here.
     */
    public molangVariables?: string;

    /** Reads the dimension, the actor, the position, the effect name and the variables. */
    public decodePayload(): void {
        this.dimensionId = this.readByte();
        this.actorId = this.readVarLong();
        this.position = NetworkUtil.readVector3(this);
        this.effectName = NetworkUtil.readString(this);
        this.molangVariables = this.readBoolean() ? NetworkUtil.readString(this) : undefined;
    }

    /** Writes the dimension, the actor, the position, the effect name and the variables. */
    public encodePayload(): void {
        this.writeByte(this.dimensionId);
        this.writeVarLong(this.actorId);
        NetworkUtil.writeVector3(this, this.position);
        NetworkUtil.writeString(this, this.effectName);

        if (this.molangVariables === undefined) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            NetworkUtil.writeString(this, this.molangVariables);
        }
    }
}
