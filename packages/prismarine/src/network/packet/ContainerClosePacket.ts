import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ContainerClosePacket extends DataPacket {
    public static NetID = Identifiers.ContainerClosePacket;

    public windowId!: number;

    public encodePayload(): void {
        this.writeByte(this.windowId);
        this.writeByte(0);
    }

    public decodePayload(): void {
        this.windowId = this.readByte();
        this.readByte();
    }
}
