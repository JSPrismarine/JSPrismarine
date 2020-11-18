import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ContainerClosePacket extends DataPacket {
    static NetID = Identifiers.ContainerClosePacket;

    public windowId!: number;

    public encodePayload() {
        this.writeByte(this.windowId);
        this.writeByte(0);
    }

    public decodePayload() {
        this.windowId = this.readByte();
        this.readByte();
    }
}
