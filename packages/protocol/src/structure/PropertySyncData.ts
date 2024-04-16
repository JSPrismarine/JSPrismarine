import type { NetworkBinaryStream } from '../';
import { NetworkStructure } from '../';

/**
 * Represents a network structure of property sync data.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/PropertySyncData.html}
 */
export default class PropertySyncData extends NetworkStructure {
    /**
     * Represents the data structure for synchronizing properties over the network.
     * @param intEntriesList - An array of tuples representing integer entries.
     * @param floatEntriesList - An array of tuples representing float entries.
     */
    public constructor(
        // [property index, data]
        public intEntriesList: Array<[number, number]>,
        public floatEntriesList: Array<[number, number]>
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedVarInt(this.intEntriesList.length);
        for (const entry of this.intEntriesList) {
            stream.writeUnsignedVarInt(entry[0]);
            stream.writeVarInt(entry[1]);
        }
    }

    public deserialize(_stream: NetworkBinaryStream): void {
        throw new Error('Method not implemented.');
    }
}
