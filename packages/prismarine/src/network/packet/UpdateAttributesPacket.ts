import { Attribute } from '../../entity/Attribute.js';
import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class UpdateAttributesPacket extends DataPacket {
    public static NetID = Identifiers.UpdateAttributesPacket;

    public runtimeEntityId!: bigint;
    public attributes: Attribute[] = [];

    public tick!: bigint;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        // Encode attributes
        this.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) {
            attribute.networkSerialize(this);
        }

        this.writeUnsignedVarLong(this.tick);
    }

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();

        const length = this.readUnsignedVarInt();
        this.attributes = Array.from({ length }, () => Attribute.networkDeserialize(this));

        this.tick = this.readUnsignedVarLong();
    }
}
