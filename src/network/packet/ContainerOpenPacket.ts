import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ContainerOpenPacket extends DataPacket {
    static NetID = Identifiers.ContainerOpenPacket;
    public windowId: number = 0;
    public containerType: number = 0;

    public containerX: number = 0;
    public containerY: number = 0;
    public containerZ: number = 0;
    public containerEntityId: bigint = BigInt(0);

    public encodePayload() {
        this.writeByte(this.windowId);
        this.writeByte(this.containerType);

        // Container position
        this.writeVarInt(this.containerX);
        this.writeUnsignedVarInt(this.containerY);
        this.writeVarInt(this.containerZ);

        this.writeVarLong(this.containerEntityId);
    }
}
