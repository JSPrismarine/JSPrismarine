import Identifiers from '../Identifiers';
import MovementType from '../type/MovementType';
import DataPacket from './DataPacket';

export default class MovePlayerPacket extends DataPacket {
    static NetID = Identifiers.MovePlayerPacket;

    public runtimeEntityId: bigint = BigInt(0);

    public positionX: number = 0;
    public positionY: number = 0;
    public positionZ: number = 0;

    public pitch: number = 0;
    public yaw: number = 0;
    public headYaw: number = 0;

    public mode: number = 0;

    public onGround: boolean = false;

    public ridingEntityRuntimeId: bigint = BigInt(0);

    public teleportCause: number = 0;
    public teleportItemId: number = 0;

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
        this.writeBool(+this.onGround);
        this.writeUnsignedVarLong(this.ridingEntityRuntimeId);
        if (this.mode === MovementType.Teleport) {
            this.writeLInt(this.teleportCause);
            this.writeLInt(this.teleportItemId);
        }
    }
}
