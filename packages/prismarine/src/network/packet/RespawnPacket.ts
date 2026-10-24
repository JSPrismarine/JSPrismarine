import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The `State` field, the docs' `PlayerRespawnState`.
 *
 * The first two are the server's to send; the third is only ever sent by the client.
 */
export enum PlayerRespawnState {
    /** The server is looking for somewhere to put the player. */
    SearchingForSpawn = 0,
    /** The server's answer to the client saying it has finished loading. */
    ReadyToSpawn = 1,
    /** The client reporting that it has finished loading. */
    ClientReadyToSpawn = 2
}

/**
 * One step of the respawn handshake, which both sides send.
 *
 * Protocol 2193 wire order, with the docs' field names: `Position` (a `Vec3` of three little
 * endian floats), `State` (uint8 holding a {@link PlayerRespawnState}) and `Player Runtime Id` (an
 * `ActorRuntimeID`, one varuint64).
 *
 * **Bound To:** Client and Server
 */
export default class RespawnPacket extends DataPacket {
    public static NetID = Identifiers.RespawnPacket;

    /** `Position` the player reappears at. Null writes the origin. */
    public position: Vector3 | null = null;
    /** `State`, which half of the handshake this is. */
    public state!: PlayerRespawnState;
    /** `Player Runtime Id` of the player respawning. */
    public runtimeEntityId!: bigint;

    /** Writes the three fields in the protocol 2193 order described on the class. */
    public encodePayload(): void {
        NetworkUtil.writeVector3(this, this.position);
        this.writeByte(this.state);
        this.writeUnsignedVarLong(this.runtimeEntityId);
    }

    /** Reads the three fields in the protocol 2193 order described on the class. */
    public decodePayload(): void {
        this.position = NetworkUtil.readVector3(this);
        this.state = this.readByte();
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
