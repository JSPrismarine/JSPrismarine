import Identifiers from '../Identifiers';
import MovementType from '../type/MovementType';
import DataPacket from './DataPacket';

export default class MovePlayerPacket extends DataPacket {
    static NetID = Identifiers.MovePlayerPacket;

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

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.positionX = this.readLFloat();
        this.positionY = this.readLFloat();
        this.positionZ = this.readLFloat();

        this.pitch = this.readLFloat();
        this.yaw = this.readLFloat();
        this.headYaw = this.readLFloat();

        this.mode = this.readByte();
        this.onGround = this.readBool();
        this.ridingEntityRuntimeId = this.readUnsignedVarLong();

        if (this.mode === MovementType.Teleport) {
            this.teleportCause = this.readLInt();
            this.teleportItemId = this.readLInt();
        }
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeLFloat(this.positionX);
        this.writeLFloat(this.positionY);
        this.writeLFloat(this.positionZ);

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        this.writeByte(this.mode);
        this.writeBool(this.onGround);
        this.writeUnsignedVarLong(this.ridingEntityRuntimeId);

        if (this.mode === MovementType.Teleport) {
            this.writeLInt(this.teleportCause);
            this.writeLInt(this.teleportItemId);
        }
    }
}
