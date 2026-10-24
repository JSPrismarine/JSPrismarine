import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * An `mce::UUID`: `Most Significant Bits` then `Least Significant Bits`, each a uint64 little
 * endian. Both halves are unsigned, so a half with its top bit set (half of all random UUIDs)
 * must go through the unsigned writers; the signed ones throw a RangeError at 2^63.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/mce-uuid/}
 */
export default class UUID extends NetworkStructure {
    /**
     * Creates a UUID from its two halves.
     * @param most - `Most Significant Bits`, in `[0, 2^64)`.
     * @param least - `Least Significant Bits`, in `[0, 2^64)`.
     */
    public constructor(
        public most: bigint,
        public least: bigint
    ) {
        super();
    }

    /** Writes both halves as uint64 little endian. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedLongLE(this.most);
        stream.writeUnsignedLongLE(this.least);
    }

    /** Reads both halves as uint64 little endian. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.most = stream.readUnsignedLongLE();
        this.least = stream.readUnsignedLongLE();
    }
}
