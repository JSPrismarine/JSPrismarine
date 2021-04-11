import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

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
 *
 * @public
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
    public metadata!: Map<number, [number, bigint | number | boolean | string]>;
    public links = [];

    public encodePayload() {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeString(this.type);

        this.writeLFloat(this.position.getX());
        this.writeLFloat(this.position.getY());
        this.writeLFloat(this.position.getZ());

        this.writeLFloat(this.motion.getX());
        this.writeLFloat(this.motion.getY());
        this.writeLFloat(this.motion.getZ());

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        // TODO: attributes
        this.writeUnsignedVarInt(this.attributes.length);

        // TODO: fixme
        const metadata = Array.from(this.metadata);
        this.writeUnsignedVarInt(/* metadata.length */ 0);

        /* metadata.forEach(([key, [type, value]]) => {
            this.writeUnsignedVarInt(key);
            this.writeUnsignedVarInt(type);

            switch (type) {
                case FlagType.BYTE:
                    this.writeByte(value as number);
                    break;
                case FlagType.SHORT:
                    this.writeShort(value as number);
                    break;
                case FlagType.INT:
                    this.writeVarInt(value as number);
                    break;
                case FlagType.FLOAT:
                    this.writeFloat(value as number);
                    break;
                case FlagType.STRING:
                    this.writeString(value as string);
                    break;
                case FlagType.ITEM:
                    // TODO:
                    break;
                case FlagType.POSITION:
                    // TODO:
                    break;
                case FlagType.LONG:
                    this.writeLong(value as bigint);
                    break;
                case FlagType.VECTOR:
                    // TODO:
                    break;
                default:
                    throw new Error(`Invalid type: ${type}`);
            }
        }); */

        // TODO: links
        this.writeUnsignedVarInt(this.links.length);
    }
}
