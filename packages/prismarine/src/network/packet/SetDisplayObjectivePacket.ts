import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class SetDisplayObjectivePacket extends DataPacket {
    public static NetID = Identifiers.SetDisplayObjectivePacket;

    public displaySlot!: string;
    public objectiveId!: string;
    public displayName!: string;
    public criteria!: string;
    public sortOrder!: number;

    public decodePayload() {
        this.displaySlot = McpeUtil.readString(this);
        this.objectiveId = McpeUtil.readString(this);
        this.displayName = McpeUtil.readString(this);
        this.criteria = McpeUtil.readString(this);
        this.sortOrder = this.readVarInt();
    }

    public encodePayload() {
        McpeUtil.writeString(this, this.displaySlot);
        McpeUtil.writeString(this, this.objectiveId);
        McpeUtil.writeString(this, this.displayName);
        McpeUtil.writeString(this, this.criteria);
        this.writeVarInt(this.sortOrder);
    }
}
