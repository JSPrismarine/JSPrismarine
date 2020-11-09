import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ContainerClosePacket extends DataPacket {
    static NetID = Identifiers.ContainerClosePacket;

    public windowId: number = 0;

    public encodePayload() {
        this.writeByte(this.windowId);
    }

    public decodePayload() {
        this.windowId = this.readByte();
    }
}
