import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class OnScreenTextureAnimationPacket extends DataPacket {
    public static NetID = Identifiers.OnScreenTextureAnimationPacket;

    public animationType!: number;

    public decodePayload() {
        this.animationType = this.readUnsignedIntLE();
    }

    public encodePayload() {
        this.writeUnsignedIntLE(this.animationType);
    }
}
