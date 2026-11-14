import { moveActorDeltaPacket } from '../wire/definitions/moveActorDelta';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/move-actor-delta-packet/
 */
export default class MoveActorDeltaPacket extends FieldNetworkPacket {
    /** Runtime id of the actor being moved. */
    public runtimeEntityId = 0n;

    /** New X coordinate, left out when X did not change. */
    public positionX: number | undefined;

    /** New Y coordinate, left out when Y did not change. */
    public positionY: number | undefined;

    /** New Z coordinate, left out when Z did not change. */
    public positionZ: number | undefined;

    /** New pitch in degrees, left out when it did not change. */
    public pitch: number | undefined;

    /** New body yaw in degrees, left out when it did not change. */
    public yaw: number | undefined;

    /** New head yaw in degrees, left out when it did not change or the actor is not a mob. */
    public headYaw: number | undefined;

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

    /** Writes the runtime id, every set component, the four flags and the tick count. */
    public encodePayload(): void {
        layoutAt(moveActorDeltaPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order; an absent component is left `undefined`. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(moveActorDeltaPacket, this.codecProtocol).decode(this));
    }
}
