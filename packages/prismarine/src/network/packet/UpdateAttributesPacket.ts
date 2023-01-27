import { Attribute } from '../../entity/Attribute.js';
import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class UpdateAttributesPacket extends DataPacket {
    public static NetID = Identifiers.UpdateAttributesPacket;

    public runtimeEntityId!: bigint;
    public attributes: Attribute[] = [];

    public tick!: bigint;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        // console.log(this.getBuffer())
        // this.write(Buffer.from('01000000000000003fcdcccc3dcdcccc3d126d696e6563726166743a6d6f76656d656e740000', 'hex'));
        // console.log(this.getBuffer())
        

        // 1d0201000000000000003fcdcccc3dcdcccc3d126d696e6563726166743a6d6f76656d656e740000

        // Encode attributes
        this.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) {
            attribute.networkSerialize(this);
        }
        // 1d02 01000000000000003fcdcccc3dcdcccc3d126d696e6563726166743a6d6f76656d656e740000
        this.writeUnsignedVarLong(this.tick); 
    }

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        
        const length = this.readUnsignedVarInt();
        this.attributes = Array.from({ length }, () => Attribute.networkDeserialize(this));

        this.tick = this.readUnsignedVarLong();
    }
}
