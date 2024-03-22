import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ClientCacheStatusPacket extends DataPacket {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    public enabled!: boolean;

    public decodePayload() {
        this.enabled = this.readBoolean();
    }
}
