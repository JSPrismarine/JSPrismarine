import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Spawns a painting on the client.
 *
 * **Bound To:** Client
 *
 * Paintings are one of the few actors that do not travel in `AddActorPacket`: the motif
 * picks both the artwork and the size, so none of the actor data a generic spawn carries
 * applies.
 *
 * Protocol 2193 layout (docs id 22), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | ZigZag encoded |
 * | Target Runtime ID | varuint64 | |
 * | Position | Vec3 | Three little-endian floats |
 * | Direction | varint32 | The wall the painting hangs on |
 * | Motif | string | The artwork's name, such as `Kebab` |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-painting-packet/
 */
export default class AddPaintingPacket extends DataPacket {
    public static NetID = Identifiers.AddPaintingPacket;

    /** Target Actor ID, the painting's unique id. */
    public targetActorId = 0n;

    /** Target Runtime ID, the painting's id for this session. */
    public targetRuntimeId = 0n;

    /** Position, the bottom left corner of the artwork rather than its center. */
    public position: Vector3 = new Vector3(0, 0, 0);

    /** Direction, the facing of the wall the painting is on. */
    public direction = 0;

    /** Motif, the name of the artwork. The client rejects a name it does not know. */
    public motif = '';

    /** Reads the painting's ids, placement, and motif. */
    public decodePayload(): void {
        this.targetActorId = this.readVarLong();
        this.targetRuntimeId = this.readUnsignedVarLong();
        this.position = NetworkUtil.readVector3(this);
        this.direction = this.readVarInt();
        this.motif = NetworkUtil.readString(this);
    }

    /** Writes the painting's ids, placement, and motif. */
    public encodePayload(): void {
        this.writeVarLong(this.targetActorId);
        this.writeUnsignedVarLong(this.targetRuntimeId);
        NetworkUtil.writeVector3(this, this.position);
        this.writeVarInt(this.direction);
        NetworkUtil.writeString(this, this.motif);
    }
}
