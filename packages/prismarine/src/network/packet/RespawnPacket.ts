import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

export default class RespawnPacket extends DataPacket {
    public static NetID = Identifiers.RespawnPacket;

    public position!: Vector3 | null;
    public state!: RespawnState;
    public runtimeEntityId!: bigint;

    public encodePayload(): void {
        NetworkUtil.writeVector3(this, this.position);
        this.writeByte(this.state);
        this.writeUnsignedVarLong(this.runtimeEntityId);
    }

    public decodePayload(): void {
        this.position = NetworkUtil.readVector3(this);
        this.state = this.readByte();
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}

export enum RespawnState {
    SERVER_SEARCHING_FOR_SPAWN,
    SERVER_READY_TO_SPAWN,
    CLIENT_READY_TO_SPAWN
}
