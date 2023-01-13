import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';

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
