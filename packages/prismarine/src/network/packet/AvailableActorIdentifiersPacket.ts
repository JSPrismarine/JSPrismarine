import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

import { entity_identifiers } from '@jsprismarine/bedrock-data';

export default class AvailableActorIdentifiersPacket extends DataPacket {
    public static NetID = Identifiers.AvailableActorIdentifiersPacket;

    private cachedNBT: any;

    public encodePayload() {
        this.write(this.cachedNBT || (this.cachedNBT = entity_identifiers));
    }
}
