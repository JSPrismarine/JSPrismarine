import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class ClientCacheStatusPacket extends DataPacket {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    public enabled!: boolean;

    public decodePayload() {
        this.enabled = this.readBoolean();
    }
}
