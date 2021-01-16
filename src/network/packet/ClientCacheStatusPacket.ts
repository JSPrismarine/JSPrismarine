import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ClientCacheStatusPacket extends DataPacket {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    enabled!: boolean;

    decodePayload() {
        this.enabled = this.readBool();
    }
}
