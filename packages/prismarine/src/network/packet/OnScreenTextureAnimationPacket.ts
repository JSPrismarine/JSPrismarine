import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class OnScreenTextureAnimationPacket extends DataPacket {
    public static NetID = Identifiers.OnScreenTextureAnimationPacket;

    public animationType!: number;

    public decodePayload() {
        this.animationType = this.readLInt();
    }

    public encodePayload() {
        this.writeLInt(this.animationType);
    }
}
