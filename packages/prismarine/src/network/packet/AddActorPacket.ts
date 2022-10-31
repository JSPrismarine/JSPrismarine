import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';
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

    public encodePayload(): void {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        McpeUtil.writeString(this, this.type);

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

        // TODO: attributes
        this.writeUnsignedVarInt(this.attributes.length);

        // TODO: fixme
        // const metadata = Array.from(this.metadata);
        this.writeUnsignedVarInt(/* metadata.length */ 0);

        this.writeUnsignedVarInt(0); // ? unknown
        this.writeUnsignedVarInt(0); // ? unknown

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
