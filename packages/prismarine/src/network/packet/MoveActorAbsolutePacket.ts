import { layoutAt, moveActorAbsolutePacket } from '@jsprismarine/protocol';

import type { Vector3 } from '@jsprismarine/math';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Where an entity now is, as the server tells a client.
 *
 * The payload is one `MoveActorAbsoluteData`. Protocol 2193 wire order, with the docs' field
 * names: `ActorRuntimeID` (varuint64), `Header` (uint8, the flags below), `Position` (three
 * little-endian floats), then `Rotation X`, `Rotation Y` and `Rotation Y Head`, each one byte
 * holding the angle as a 256th of a turn.
 *
 * The docs defer the `Header` bits to a supplemental document that is not published. The
 * values here are the ones every open implementation agrees on: on ground 0x01, teleport
 * 0x02, force move local entity 0x04, force completion 0x08.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/move-actor-absolute-packet/
 */
export default class MoveActorAbsolutePacket extends FieldNetworkPacket {
    /** The entity is standing on something, rather than falling. */
    public static readonly FLAG_ON_GROUND = 0x01;

    /**
     * The entity did not travel to where it now is.
     *
     * A client interpolates an ordinary move over the ticks until the next one and snaps straight
     * to a teleport, so this belongs on a teleport and nothing else. Setting it on a walking mob
     * is what turns smooth movement into a stutter.
     */
    public static readonly FLAG_TELEPORT = 0x02;

    /**
     * Snap an entity the receiving client owns locally, which {@link FLAG_TELEPORT} alone does not
     * cover. The docs' `Force Move Local Entity`, as `MoveActorDeltaPacket` spells it out.
     */
    public static readonly FLAG_FORCE_MOVE_LOCAL_ENTITY = 0x04;

    /**
     * Finish any movement already in progress on the client before applying this one. The
     * docs' `Force Completion`.
     */
    public static readonly FLAG_FORCE_COMPLETION = 0x08;

    public runtimeEntityId!: bigint;
    public flags!: number;

    public position!: Vector3;

    /**
     * The three rotations, in degrees, named for what they are.
     *
     * They were `rotationX`, `rotationY` and `rotationZ`, which is what made them easy to fill in
     * wrongly: nothing in those names says which is which, and the packet's order - pitch, then
     * *body* yaw, then head yaw - is not the order they are usually listed in. Filled in as pitch,
     * head, body, an entity's head is set from its body and its body from its head, which shows up
     * as a head that is stuck at the wrong angle and never turns.
     *
     * The docs call them `Rotation X`, `Rotation Y` and `Rotation Y Head`, in that order.
     * @see https://apidoc-dev.pmmp.io/d1/d15/_move_actor_absolute_packet_8php_source.html
     */
    public pitch: number = 0;
    public yaw: number = 0;
    public headYaw: number = 0;

    public encodePayload(): void {
        layoutAt(moveActorAbsolutePacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId,
            flags: this.flags || 0,
            position: this.position,
            pitch: this.pitch,
            yaw: this.yaw,
            headYaw: this.headYaw
        });
    }

    /** Reads the fields in the order listed on the class; the rotations come back in degrees. */
    public decodePayload(): void {
        const read = layoutAt(moveActorAbsolutePacket, this.codecProtocol).decode(this);
        this.runtimeEntityId = read.runtimeEntityId;
        this.flags = read.flags;
        this.position = read.position;
        this.pitch = read.pitch;
        this.yaw = read.yaw;
        this.headYaw = read.headYaw;
    }
}
