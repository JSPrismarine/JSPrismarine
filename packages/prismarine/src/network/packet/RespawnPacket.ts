import { PlayerRespawnState } from '@jsprismarine/minecraft';
import { layoutAt, respawnPacket } from '@jsprismarine/protocol';

import { Vector3 } from '@jsprismarine/math';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The `State` field, the docs' `PlayerRespawnState`, generated from Mojang's 1.26.51 release
 * documentation in `@jsprismarine/minecraft`. The first two are the server's to send; the
 * third is only ever sent by the client.
 * @deprecated Import `PlayerRespawnState` from `@jsprismarine/minecraft` instead.
 */
export { PlayerRespawnState };

/**
 * One step of the respawn handshake, which both sides send.
 *
 * Protocol 2193 wire order, with the docs' field names: `Position` (a `Vec3` of three little
 * endian floats), `State` (uint8 holding a {@link PlayerRespawnState}) and `Player Runtime Id` (an
 * `ActorRuntimeID`, one varuint64).
 *
 * **Bound To:** Client and Server
 */
export default class RespawnPacket extends FieldNetworkPacket {
    /** `Position` the player reappears at. Null writes the origin. */
    public position: Vector3 | null = null;
    /** `State`, which half of the handshake this is. */
    public state!: PlayerRespawnState;
    /** `Player Runtime Id` of the player respawning. */
    public runtimeEntityId!: bigint;

    /** Writes the three fields in the protocol 2193 order described on the class. */
    public encodePayload(): void {
        const position = this.position ?? new Vector3(0, 0, 0);
        layoutAt(respawnPacket, this.codecProtocol).encode(this, {
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            state: this.state,
            runtimeEntityId: this.runtimeEntityId
        });
    }

    /** Reads the three fields in the protocol 2193 order described on the class. */
    public decodePayload(): void {
        const read = layoutAt(respawnPacket, this.codecProtocol).decode(this);
        this.position = new Vector3(read.position.x, read.position.y, read.position.z);
        this.state = read.state;
        this.runtimeEntityId = read.runtimeEntityId;
    }
}
