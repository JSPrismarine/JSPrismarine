import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class CommandBlockUpdatePacket extends DataPacket {
    public static NetID = Identifiers.CommandBlockUpdatePacket;

    public isBlock!: boolean;
    public position!: Vector3;
    public mode!: number;
    public needsRedstone!: boolean;
    public conditional!: boolean;
    public minecartEntityRuntimeID!: bigint;
    public command!: string;
    public lastOutput!: string;
    public name!: string;
    public shouldTrackOutput!: boolean;
    public tickDelay!: number;
    public executeOnFirstTick!: boolean;

    public decodePayload() {
        this.isBlock = this.readBool();
        if (this.isBlock) {
            this.position = Vector3.networkDeserialize(this);
            this.mode = this.readUnsignedVarInt();
            this.needsRedstone = this.readBool();
            this.conditional = this.readBool();
        } else {
            this.minecartEntityRuntimeID = this.readLong();
        }
        this.command = this.readString();
        this.lastOutput = this.readString();
        this.name = this.readString();
        this.shouldTrackOutput = this.readBool();
        this.tickDelay = this.readLInt();
        this.executeOnFirstTick = this.readBool();
    }

    public encodePayload() {
        this.writeBool(this.isBlock);
        if (this.isBlock) {
            this.position.networkSerialize(this);
            this.writeUnsignedVarInt(this.mode);
            this.writeBool(this.needsRedstone);
            this.writeBool(this.conditional);
        } else {
            this.writeLong(this.minecartEntityRuntimeID);
        }
        this.writeString(this.command);
        this.writeString(this.lastOutput);
        this.writeString(this.name);
        this.writeBool(this.shouldTrackOutput);
        this.writeLInt(this.tickDelay);
        this.writeBool(this.executeOnFirstTick);
    }
}
