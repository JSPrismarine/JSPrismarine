import BinaryStream from '@jsprismarine/binaryutils';
import { randomUUID } from 'node:crypto';

export default class UUID {
    private readonly parts: number[] = [];
    private readonly version: number;

    /**
     * Creates a uuid from the four 32-bit words of its big-endian form, in order.
     *
     * A word is kept as a signed int32, which is how {@link fromBinary} reads it; an unsigned
     * word such as `0x8899aabb` is accepted and wrapped, so two uuids built either way are
     * equal and both go on the wire.
     * @param part1 - The first word (`xxxxxxxx-....`).
     * @param part2 - The second word.
     * @param part3 - The third word.
     * @param part4 - The fourth word.
     * @param version - The uuid version, taken from `part2` when zero.
     */
    public constructor(part1 = 0, part2 = 0, part3 = 0, part4 = 0, version = 4) {
        this.parts = [part1 | 0, part2 | 0, part3 | 0, part4 | 0];
        this.version = version || (this.parts[1]! & 0xf000) >> 12;
    }

    public equals(uuid: UUID): boolean {
        return (
            this.parts.length === uuid.parts.length && this.parts.every((value, index) => value === uuid.parts[index])
        );
    }

    /**
     * Creates an UUID from a string hex representation
     */
    public static fromString(uuid: string, version = 4): UUID {
        if (!uuid) throw new Error('uuid is null or undefined');

        return UUID.fromBinary(Buffer.from(uuid.trim().replaceAll('-', ''), 'hex'), version);
    }

    /**
     * Creates an UUID from a binary representation
     */
    public static fromBinary(uuid: Buffer, version: number): UUID {
        if (uuid.byteLength !== 16) {
            throw new Error('UUID must have 16 bytes');
        }

        const stream = new BinaryStream(uuid);
        return new UUID(stream.readInt(), stream.readInt(), stream.readInt(), stream.readInt(), version);
    }

    /**
     * Generates a random UUIDv4 (string)
     */
    public static randomString(): string {
        return randomUUID({
            disableEntropyCache: true
        });
    }

    /**
     * Generates a random UUIDv4
     */
    public static fromRandom(): UUID {
        const stringUUID = UUID.randomString();
        return UUID.fromString(stringUUID, 4);
    }

    public toBinary(): Buffer {
        const stream = new BinaryStream();
        stream.writeInt(this.parts[0]!);
        stream.writeInt(this.parts[1]!);
        stream.writeInt(this.parts[2]!);
        stream.writeInt(this.parts[3]!);
        return stream.getBuffer();
    }

    public toString(): string {
        const hex = this.toBinary().toString('hex');

        // Xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx 8-4-4-4-12
        const parts = [];
        parts.push(hex.slice(0, 8));
        parts.push(hex.slice(8, 8 + 4));
        parts.push(hex.slice(12, 12 + 4));
        parts.push(hex.slice(16, 16 + 4));
        parts.push(hex.slice(20, 20 + 12));
        return parts.join('-');
    }

    public getVersion(): number {
        return this.version;
    }

    public getParts(): number[] {
        return this.parts;
    }

    /**
     * Writes this uuid as an `mce::UUID`: `Most Significant Bits` then `Least Significant
     * Bits`, each a uint64 little endian.
     *
     * Each half goes out as its two halves in little-endian order, which is the same sixteen
     * bytes a uint64 writer would produce and keeps the parts as the int32s they are read as.
     * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/mce-uuid/}
     * @param stream - The network stream.
     */
    public networkSerialize(stream: BinaryStream): void {
        const [part0 = 0, part1 = 0, part2 = 0, part3 = 0] = this.parts;

        stream.writeIntLE(part1);
        stream.writeIntLE(part0);
        stream.writeIntLE(part3);
        stream.writeIntLE(part2);
    }

    /**
     * Reads an `mce::UUID` written by {@link networkSerialize}.
     * @param stream - The network stream.
     * @returns The uuid.
     */
    public static networkDeserialize(stream: BinaryStream): UUID {
        const part1 = stream.readIntLE();
        const part0 = stream.readIntLE();
        const part3 = stream.readIntLE();
        const part2 = stream.readIntLE();
        return new UUID(part0, part1, part2, part3);
    }
}
