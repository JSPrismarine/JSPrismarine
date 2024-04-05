import { NetworkStructure } from '../';
import NetworkBinaryStream from '../NetworkBinaryStream';

export default class UUID extends NetworkStructure {
    public constructor(
        public most: bigint,
        public least: bigint
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeLongLE(this.most);
        stream.writeLongLE(this.least);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.most = stream.readLongLE();
        this.least = stream.readLongLE();
    }
}
