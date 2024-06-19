import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

import { entity_identifiers } from '@jsprismarine/bedrock-data';

export default class AvailableActorIdentifiersPacket extends DataPacket {
    public static NetID = Identifiers.AvailableActorIdentifiersPacket;

    private cachedNBT: any;

    public encodePayload(): void {
        this.write(this.cachedNBT || (this.cachedNBT = entity_identifiers));
    }
}
