import type { Metadata } from '../../entity/Metadata';
import Vector3 from '../../math/Vector3';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Packet for adding an entity to the game.
 *
 * **Bound To:** Client
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | uniqueEntityId | VarLong | |
 * | runtimeEntityId | UnsignedVarLong | |
 * | type | String | The namespaced entity ID |
 * | position | Vector3 (LFloat) | The entity's position |
 * | motion | Vector3 (LFloat) | The entity's motion |
 * | pitch | LFloat |  |
 * | yaw | LFloat |  |
 * | headYaw | LFloat |  |
 */
export default class AddActorPacket extends DataPacket {
    public static NetID = Identifiers.AddActorPacket;

    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public type!: string;
    public position: Vector3 = new Vector3(0, 0, 0);
    public motion: Vector3 = new Vector3(0, 0, 0);
    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public attributes = [];
    public metadata!: Metadata;
    public links = [];

    public encodePayload(): void {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        NetworkUtil.writeString(this, this.type);

        this.writeFloatLE(this.position.getX());
        this.writeFloatLE(this.position.getY());
        this.writeFloatLE(this.position.getZ());

        this.writeFloatLE(this.motion.getX());
        this.writeFloatLE(this.motion.getY());
        this.writeFloatLE(this.motion.getZ());

        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);
        this.writeFloatLE(this.yaw); // bodyYaw

        this.writeUnsignedVarInt(0); // TODO: attributes.
        this.metadata.networkSerialize(this);

        this.writeUnsignedVarInt(0); // ? unknown
        this.writeUnsignedVarInt(0); // ? unknown

        // TODO: links
        this.writeUnsignedVarInt(this.links.length);
    }
}
