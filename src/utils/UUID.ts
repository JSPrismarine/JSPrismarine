import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class UUID {
    private readonly parts: number[] = [];
    private readonly version: number;

    public constructor(
        part1 = 0,
        part2 = 0,
        part3 = 0,
        part4 = 0,
        version = 4
    ) {
        this.parts = [part1, part2, part3, part4];
        this.version = version ?? (this.parts[1] & 0xf000) >> 12;
    }

    public equals(uuid: UUID): boolean {
        return (
            this.parts.length === uuid.parts.length &&
            this.parts.every((value, index) => value === uuid.parts[index])
        );
    }

    /**
     * Creates an UUID from a string hex representation
     */
    public static fromString(uuid: string, version = 4): UUID {
        if (!uuid) throw new Error('uuid is null or undefined');

        return UUID.fromBinary(
            Buffer.from(uuid.trim().replace(/-/g, ''), 'hex'),
            version
        );
    }

    /**
     * Creates an UUID from a binary representation
     */
    public static fromBinary(uuid: Buffer, version: number): UUID {
        if (Buffer.byteLength(uuid) !== 16) {
            throw new Error('UUID must have 16 bytes');
        }

        const stream = new BinaryStream(uuid);
        return new UUID(
            stream.readInt(),
            stream.readInt(),
            stream.readInt(),
            stream.readInt(),
            version
        );
    }

    /**
     * Generates a random UUIDv4 (string)
     */
    public static randomString(): string {
        let dt = Date.now();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.trunc((dt + Math.random() * 16) % 16);
            dt = Math.floor(dt / 16);
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    /**
     * Generates a random UUIDv4
     */
    public static fromRandom(): UUID {
        const stringUUID = UUID.randomString();
        return UUID.fromString(stringUUID, 3);
    }

    public toBinary(): Buffer {
        const stream = new BinaryStream();
        stream.writeInt(this.parts[0]);
        stream.writeInt(this.parts[1]);
        stream.writeInt(this.parts[2]);
        stream.writeInt(this.parts[3]);
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
}
