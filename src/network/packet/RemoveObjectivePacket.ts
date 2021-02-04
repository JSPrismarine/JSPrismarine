import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class RemoveObjectivePacket extends DataPacket {
    public static NetID = Identifiers.RemoveObjectivePacket;

    public ObjectiveId!: string;

    public decodePayload() {
        this.ObjectiveId = this.readString();
    }

    public encodePayload() {
        this.writeString(this.ObjectiveId);
    }
}
