import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';
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
        this.isBlock = this.readBoolean();
        if (this.isBlock) {
            this.position = Vector3.networkDeserialize(this);
            this.mode = this.readUnsignedVarInt();
            this.needsRedstone = this.readBoolean();
            this.conditional = this.readBoolean();
        } else {
            this.minecartEntityRuntimeID = this.readUnsignedLong();
        }
        this.command = McpeUtil.readString(this);
        this.lastOutput = McpeUtil.readString(this);
        this.name = McpeUtil.readString(this);
        this.shouldTrackOutput = this.readBoolean();
        this.tickDelay = this.readUnsignedIntLE();
        this.executeOnFirstTick = this.readBoolean();
    }

    public encodePayload() {
        this.writeBoolean(this.isBlock);
        if (this.isBlock) {
            this.position.networkSerialize(this);
            this.writeUnsignedVarInt(this.mode);
            this.writeBoolean(this.needsRedstone);
            this.writeBoolean(this.conditional);
        } else {
            this.writeUnsignedLong(this.minecartEntityRuntimeID);
        }
        McpeUtil.writeString(this, this.command);
        McpeUtil.writeString(this, this.lastOutput);
        McpeUtil.writeString(this, this.name);
        this.writeBoolean(this.shouldTrackOutput);
        this.writeUnsignedIntLE(this.tickDelay);
        this.writeBoolean(this.executeOnFirstTick);
    }
}
