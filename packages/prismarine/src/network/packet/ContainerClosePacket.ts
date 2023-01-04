import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class ContainerClosePacket extends DataPacket {
    public static NetID = Identifiers.ContainerClosePacket;

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
