import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class RemoveObjectivePacket extends DataPacket {
    public static NetID = Identifiers.RemoveObjectivePacket;

    public objectiveId!: string;

    public decodePayload() {
        this.objectiveId = McpeUtil.readString(this);
    }

    public encodePayload() {
        McpeUtil.writeString(this, this.objectiveId);
    }
}
