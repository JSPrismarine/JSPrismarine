import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetDisplayObjectivePacket extends DataPacket {
    public static NetID = Identifiers.SetDisplayObjectivePacket;

    public displaySlot!: string;
    public objectiveId!: string;
    public displayName!: string;
    public criteria!: string;
    public sortOrder!: number;

    public decodePayload() {
        this.displaySlot = this.readString();
        this.objectiveId = this.readString();
        this.displayName = this.readString();
        this.criteria = this.readString();
        this.sortOrder = this.readVarInt();
    }

    public encodePayload() {
        this.writeString(this.displaySlot);
        this.writeString(this.objectiveId);
        this.writeString(this.displayName);
        this.writeString(this.criteria);
        this.writeVarInt(this.sortOrder);
    }
}
