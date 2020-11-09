import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

const EntityIdentifiers = require('@jsprismarine/bedrock-data')
    .entity_identifiers;

export default class AvailableActorIdentifiersPacket extends DataPacket {
    static NetID = Identifiers.AvailableActorIdentifiersPacket;

    private cachedNBT: any;

    public async encodePayload() {
        this.append(this.cachedNBT || (this.cachedNBT = EntityIdentifiers));
    }
}
