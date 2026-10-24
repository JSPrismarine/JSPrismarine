import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

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
 * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json `packet_set_entity_motion`
 */
export default class SetActorMotionPacket extends DataPacket {
    public static NetID = Identifiers.SetActorMotionPacket;

    public runtimeEntityId!: bigint;
    public motion!: Vector3;

    /**
     * The server tick this was decided on.
     *
     * Carried by every entity packet at this protocol version - see `UpdateAttributesPacket` and
     * `SetActorDataPacket`, which trail it the same way. The client uses it to order what it
     * receives against its own prediction.
     */
    public tick: bigint = 0n;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        NetworkUtil.writeVector3(this, this.motion);
        this.writeUnsignedVarLong(this.tick);
    }

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.motion = NetworkUtil.readVector3(this);
        this.tick = this.readUnsignedVarLong();
    }
}
