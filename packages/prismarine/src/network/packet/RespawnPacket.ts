import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class RespawnPacket extends DataPacket {
    public static NetID = Identifiers.RespawnPacket;

    public position!: Vector3;
    public state!: RespawnState;
    public runtimeEntityId!: bigint;

    public encodePayload(): void {
        this.position.networkSerialize(this);
        this.writeByte(this.state);
        this.writeUnsignedVarLong(this.runtimeEntityId);
    }

    public decodePayload(): void {
        this.position = Vector3.networkDeserialize(this);
        this.state = this.readByte();
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}

export enum RespawnState {
    SERVER_SEARCHING_FOR_SPAWN,
    SERVER_READY_TO_SPAWN,
    CLIENT_READY_TO_SPAWN
}
