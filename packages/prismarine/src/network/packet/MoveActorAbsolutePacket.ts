import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

export default class MoveActorAbsolutePacket extends DataPacket {
    public static NetID = Identifiers.MoveActorAbsolutePacket;

    public runtimeEntityId!: bigint;
    public flags!: number;

    public position!: Vector3;

    public rotationX!: number;
    public rotationY!: number;
    public rotationZ!: number;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeByte(this.flags || 0);
        NetworkUtil.writeVector3(this, this.position);
        this.writeByte(this.rotationX / (360 / 256));
        this.writeByte(this.rotationY / (360 / 256));
        this.writeByte(this.rotationZ / (360 / 256));
    }
}
