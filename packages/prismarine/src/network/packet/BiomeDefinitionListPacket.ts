import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

import { biome_definitions } from '@jsprismarine/bedrock-data';

export default class BiomeDefinitionListPacket extends DataPacket {
    public static NetID = Identifiers.BiomeDefinitionListPacket;

    private cachedNBT?: Buffer = biome_definitions;

    public encodePayload() {
        this.write(this.cachedNBT || (this.cachedNBT = biome_definitions));
    }
}
