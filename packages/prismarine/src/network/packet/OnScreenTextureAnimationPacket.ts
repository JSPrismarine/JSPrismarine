import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class OnScreenTextureAnimationPacket extends DataPacket {
    public static NetID = Identifiers.OnScreenTextureAnimationPacket;

    public animationType!: number;

    public decodePayload(): void {
        this.animationType = this.readUnsignedIntLE();
    }

    public encodePayload(): void {
        this.writeUnsignedIntLE(this.animationType);
    }
}
