import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import MovementType from '../type/MovementType';
import DataPacket from './DataPacket';

export default class MovePlayerPacket extends DataPacket {
    public static NetID = Identifiers.MovePlayerPacket;

    public runtimeEntityId!: bigint;

    public position!: Vector3;

    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public mode!: number;

    public onGround!: boolean;

    public ridingEntityRuntimeId!: bigint;

    public teleportCause!: number;
    public teleportItemId!: number;

    public tick!: bigint;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.position = NetworkUtil.readVector3(this);
        this.pitch = this.readFloatLE();
        this.yaw = this.readFloatLE();
        this.headYaw = this.readFloatLE();

        this.mode = this.readByte();
        this.onGround = this.readBoolean();
        this.ridingEntityRuntimeId = this.readUnsignedVarLong();

        if (this.mode === MovementType.Teleport) {
            this.teleportCause = this.readIntLE();
            this.teleportItemId = this.readIntLE();
        }

        this.tick = this.readUnsignedVarLong();
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        NetworkUtil.writeVector3(this, this.position);
        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);

        this.writeByte(this.mode);
        this.writeBoolean(this.onGround);
        this.writeUnsignedVarLong(this.ridingEntityRuntimeId);

        if (this.mode === MovementType.Teleport) {
            this.writeIntLE(this.teleportCause);
            this.writeIntLE(this.teleportItemId);
        }

        this.writeUnsignedVarLong(this.tick);
    }
}
