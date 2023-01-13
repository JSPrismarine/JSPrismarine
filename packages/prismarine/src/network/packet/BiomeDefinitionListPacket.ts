import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

import pkg from '@jsprismarine/bedrock-data';
const { biome_definitions } = pkg;

export default class BiomeDefinitionListPacket extends DataPacket {
    public static NetID = Identifiers.BiomeDefinitionListPacket;

    private cachedNBT!: Buffer;

    public encodePayload() {
        this.write(this.cachedNBT || (this.cachedNBT = biome_definitions));
    }
}
