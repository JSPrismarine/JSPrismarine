import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class RemoveObjectivePacket extends DataPacket {
    public static NetID = Identifiers.RemoveObjectivePacket;

    public objectiveId!: string;

    public decodePayload() {
        this.objectiveId = this.readString();
    }

    public encodePayload() {
        this.writeString(this.objectiveId);
    }
}
