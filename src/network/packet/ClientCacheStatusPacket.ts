import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ClientCacheStatusPacket extends DataPacket {
    static NetID = Identifiers.ClientCacheStatusPacket;

    enabled!: boolean;

    decodePayload() {
        this.enabled = this.readBool();
    }
}
