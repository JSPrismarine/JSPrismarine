import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * The synched entity properties an actor carries, split by value type.
 *
 * Wire layout, in docs order: `Int Entries List` (varuint32 count, then per entry
 * `Property Index` as varuint32 and `Data` as varint32), then `Float Entries List` (varuint32
 * count, then per entry `Property Index` as varuint32 and `Data` as float little endian).
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/property-sync-data/}
 */
export default class PropertySyncData extends NetworkStructure {
    /**
     * Creates the property lists.
     * @param intEntriesList - `Int Entries List` as `[property index, data]` pairs.
     * @param floatEntriesList - `Float Entries List` as `[property index, data]` pairs.
     */
    public constructor(
        public intEntriesList: Array<[number, number]>,
        public floatEntriesList: Array<[number, number]>
    ) {
        super();
    }

    /** Writes both lists in docs order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedVarInt(this.intEntriesList.length);
        for (const [index, data] of this.intEntriesList) {
            stream.writeUnsignedVarInt(index);
            stream.writeVarInt(data);
        }

        stream.writeUnsignedVarInt(this.floatEntriesList.length);
        for (const [index, data] of this.floatEntriesList) {
            stream.writeUnsignedVarInt(index);
            stream.writeFloatLE(data);
        }
    }

    /** Reads both lists in docs order, replacing whatever the instance held. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.intEntriesList = [];
        let intCount = stream.readUnsignedVarInt();
        while (intCount-- > 0) {
            this.intEntriesList.push([stream.readUnsignedVarInt(), stream.readVarInt()]);
        }

        this.floatEntriesList = [];
        let floatCount = stream.readUnsignedVarInt();
        while (floatCount-- > 0) {
            this.floatEntriesList.push([stream.readUnsignedVarInt(), stream.readFloatLE()]);
        }
    }
}
