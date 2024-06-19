import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

export default class MoveActorAbsolutePacket extends DataPacket {
    public static NetID = Identifiers.MoveActorAbsolutePacket;

    public runtimeEntityId!: bigint;
    public flags!: number;

    public position!: Vector3;

    public rotationX: number = 0;
    public rotationY: number = 0;
    public rotationZ: number = 0;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeByte(this.flags || 0);
        NetworkUtil.writeVector3(this, this.position);
        this.writeByte(this.rotationX / (360 / 256));
        this.writeByte(this.rotationY / (360 / 256));
        this.writeByte(this.rotationZ / (360 / 256));
    }
}
