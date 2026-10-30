import { layoutAt, setActorMotionPacket } from '@jsprismarine/protocol';

import type { Vector3 } from '@jsprismarine/math';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Gives an entity a velocity, which the receiving client then integrates itself.
 *
 * The only way to knock a *player* back. A player's position belongs to their own client - the
 * server stores what it is told and echoes it back - so moving them from here is overruled by the
 * next movement packet and shows up as rubber-banding. Asking for a velocity instead lets the
 * client do the shove, which is both authoritative and smooth.
 *
 * Mobs do not need it: the server moves them, and `MoveActorAbsolutePacket` already says where
 * they ended up.
 *
 * Protocol 2193 wire order, with the docs' field names: `Target Runtime ID` (varuint64),
 * `Motion` (three little-endian floats), `Tick` (a `PlayerInputTick`, a varuint64).
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-actor-motion-packet/
 */
export default class SetActorMotionPacket extends FieldNetworkPacket {
    public runtimeEntityId!: bigint;
    public motion!: Vector3;

    /**
     * `Tick`, a `PlayerInputTick`.
     *
     * The docs: "If this packet is referring to the player or a client predicted vehicle they
     * are in control of, this should be the most recently processed PlayerInputTick from their
     * PlayerAuthInputPacket. Otherwise zero." The client rewinds to that tick, applies the
     * velocity and replays its predictions since. The server's own tick counter is not in the
     * client's history and must not go here.
     */
    public tick: bigint = 0n;

    public encodePayload(): void {
        layoutAt(setActorMotionPacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId,
            motion: this.motion,
            tick: this.tick
        });
    }

    public decodePayload(): void {
        const read = layoutAt(setActorMotionPacket, this.codecProtocol).decode(this);
        this.runtimeEntityId = read.runtimeEntityId;
        this.motion = read.motion;
        this.tick = read.tick;
    }
}
