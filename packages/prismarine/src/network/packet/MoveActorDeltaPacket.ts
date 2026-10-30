import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** Degrees per step of the single byte a rotation is packed into. */
const DEGREES_PER_STEP = 360 / 256;

/**
 * A move of any non-player actor, with every changed component and nothing else.
 *
 * Despite the name there are no deltas left: the positions and rotations are absolute. What
 * the packet saves is the components that did not change, each of which is written as an
 * optional and skipped entirely when it is absent. A mob walking on flat ground sends X and Z
 * and leaves Y, pitch and yaw out.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Actor Runtime ID as a varuint64, then New Position X, Y and Z
 * as optional floats, Rotation X, Rotation Y and Rotation Y Head as optional packed rotation
 * bytes, Is On Ground, Force Move, Force Move Local Entity and Force Completion as booleans,
 * and Ticks as a varuint64. An optional is a presence byte followed by the value when present.
 * The docs type a rotation as int8; it is read here as the same byte unsigned, so the angle
 * comes back in `[0, 360)` rather than `[-180, 180)`.
 *
 * Up to protocol 2177 the six components were announced by a single uint16 flag field read
 * before them. 2193 replaced that with per-component presence bytes and added Ticks.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/move-actor-delta-packet/
 */
export default class MoveActorDeltaPacket extends FieldNetworkPacket {
    /** Runtime id of the actor being moved. */
    public runtimeEntityId = 0n;

    /** New X coordinate, left out when X did not change. */
    public positionX?: number;

    /** New Y coordinate, left out when Y did not change. */
    public positionY?: number;

    /** New Z coordinate, left out when Z did not change. */
    public positionZ?: number;

    /** New pitch in degrees, left out when it did not change. */
    public pitch?: number;

    /** New body yaw in degrees, left out when it did not change. */
    public yaw?: number;

    /** New head yaw in degrees, left out when it did not change or the actor is not a mob. */
    public headYaw?: number;

    /** The actor stands on something rather than falling. */
    public isOnGround = false;

    /** Snap the actor to the new position instead of interpolating towards it. */
    public forceMove = false;

    /** Snap an actor the receiver owns locally, which `forceMove` alone does not cover. */
    public forceMoveLocalEntity = false;

    /** Finish any movement already in progress before applying this one. */
    public forceCompletion = false;

    /** Ticks the client should spread the interpolation over. */
    public ticks = 0n;

    /** Reads the runtime id, every present component, the four flags and the tick count. */
    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.positionX = this.readOptionalFloat();
        this.positionY = this.readOptionalFloat();
        this.positionZ = this.readOptionalFloat();
        this.pitch = this.readOptionalRotation();
        this.yaw = this.readOptionalRotation();
        this.headYaw = this.readOptionalRotation();

        this.isOnGround = this.readBoolean();
        this.forceMove = this.readBoolean();
        this.forceMoveLocalEntity = this.readBoolean();
        this.forceCompletion = this.readBoolean();
        this.ticks = this.readUnsignedVarLong();
    }

    /** Writes the runtime id, every set component, the four flags and the tick count. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeOptionalFloat(this.positionX);
        this.writeOptionalFloat(this.positionY);
        this.writeOptionalFloat(this.positionZ);
        this.writeOptionalRotation(this.pitch);
        this.writeOptionalRotation(this.yaw);
        this.writeOptionalRotation(this.headYaw);

        this.writeBoolean(this.isOnGround);
        this.writeBoolean(this.forceMove);
        this.writeBoolean(this.forceMoveLocalEntity);
        this.writeBoolean(this.forceCompletion);
        this.writeUnsignedVarLong(this.ticks);
    }

    private readOptionalFloat(): number | undefined {
        return this.readBoolean() ? this.readFloatLE() : undefined;
    }

    private writeOptionalFloat(value: number | undefined): void {
        if (value === undefined) {
            this.writeBoolean(false);
            return;
        }

        this.writeBoolean(true);
        this.writeFloatLE(value);
    }

    private readOptionalRotation(): number | undefined {
        return this.readBoolean() ? this.readByte() * DEGREES_PER_STEP : undefined;
    }

    /**
     * Rounds and wraps before writing, the same way `MoveActorAbsolutePacket` does. Angles
     * accumulate past 360 and below 0, and the byte has to stay in range.
     */
    private writeOptionalRotation(degrees: number | undefined): void {
        if (degrees === undefined) {
            this.writeBoolean(false);
            return;
        }

        this.writeBoolean(true);
        this.writeByte(Math.round(degrees / DEGREES_PER_STEP) & 0xff);
    }
}
