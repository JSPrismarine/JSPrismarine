import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ContainerOpenPacket extends DataPacket {
    public static NetID = Identifiers.ContainerOpenPacket;
    public windowId!: number;
    public containerType!: number;

    public containerPos!: Vector3;
    public containerEntityId!: bigint;

    public encodePayload() {
        this.writeByte(this.windowId);
        this.writeByte(this.containerType);

        this.writeVarInt(this.containerPos.getX());
        this.writeVarInt(this.containerPos.getY());
        this.writeVarInt(this.containerPos.getZ());

        this.writeVarLong(this.containerEntityId);
    }

    public decodePayload() {
        this.windowId = this.readByte();
        this.containerType = this.readByte();

        this.containerPos = new Vector3(this.readVarInt(), this.readVarInt(), this.readVarInt());

        this.containerEntityId = this.readVarLong();
    }
}
