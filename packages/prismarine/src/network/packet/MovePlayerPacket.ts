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

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.position = NetworkUtil.readVector3(this);
        this.pitch = this.readFloatLE();
        this.yaw = this.readFloatLE();
        this.headYaw = this.readFloatLE();

        this.mode = this.readByte();
        this.onGround = this.readBoolean();
        this.ridingEntityRuntimeId = this.readUnsignedVarLong();

        // Optional, with a byte of its own saying whether it is there. 748 inferred that from
        // the mode and wrote nothing; at 2168 the byte is always on the wire, so a reader that
        // skips it takes it for the first byte of the tick.
        if (this.readBoolean()) {
            this.teleportCause = this.readIntLE();
            this.teleportItemId = this.readIntLE();
        }

        this.tick = this.readUnsignedVarLong();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        NetworkUtil.writeVector3(this, this.position);
        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);

        this.writeByte(this.mode);
        this.writeBoolean(this.onGround);
        this.writeUnsignedVarLong(this.ridingEntityRuntimeId);

        const teleporting = this.mode === MovementType.Teleport;
        this.writeBoolean(teleporting);
        if (teleporting) {
            this.writeIntLE(this.teleportCause);
            this.writeIntLE(this.teleportItemId);
        }

        this.writeUnsignedVarLong(this.tick);
    }
}
