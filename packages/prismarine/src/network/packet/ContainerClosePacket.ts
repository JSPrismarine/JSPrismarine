import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ContainerClosePacket extends DataPacket {
    public static NetID = Identifiers.ContainerClosePacket;

    public containerId!: number;
    public containerType!: number;
    public serverInitiatedClose!: boolean;

    public encodePayload(): void {
        this.writeByte(this.containerId);
        this.writeByte(this.containerType);
        this.writeBoolean(this.serverInitiatedClose);
    }

    public decodePayload(): void {
        this.containerId = this.readByte();
        this.containerType = this.readByte();
        this.serverInitiatedClose = this.readBoolean();
    }
}
