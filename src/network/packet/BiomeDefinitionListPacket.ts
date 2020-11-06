import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

const BiomeDefinitions = require('@jsprismarine/bedrock-data')
    .biome_definitions;

export default class BiomeDefinitionListPacket extends DataPacket {
    static NetID = Identifiers.BiomeDefinitionListPacket;

    private cachedNBT: any;

    public encodePayload() {
        this.append(this.cachedNBT || (this.cachedNBT = BiomeDefinitions));
    }
}
