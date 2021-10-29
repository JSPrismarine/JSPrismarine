import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import MovementType from '../type/MovementType';

export default class MovePlayerPacket extends DataPacket {
    public static NetID = Identifiers.MovePlayerPacket;

    public runtimeEntityId!: bigint;

    public positionX!: number;
    public positionY!: number;
    public positionZ!: number;

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

        this.positionX = this.readFloatLE();
        this.positionY = this.readFloatLE();
        this.positionZ = this.readFloatLE();

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

        this.writeFloatLE(this.positionX);
        this.writeFloatLE(this.positionY);
        this.writeFloatLE(this.positionZ);

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
