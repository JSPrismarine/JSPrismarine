import BinaryStream from '@jsprismarine/jsbinaryutils';
import InetAddress from '../utils/InetAddress';

/**
 * The base class for all packets.
 */
export default class Packet extends BinaryStream {
    private readonly id: number;

    /**
     * Create a new packet.
     */
    public constructor(id: number, buffer?: Buffer) {
        super(buffer);
        this.id = id;
    }

    /**
     * Get the packet ID.
     * @returns The packet's ID.
     */
    public getId(): number {
        return this.id;
    }

    public decode(): void {
        this.readByte();
        this.decodePayload();
    }

    protected decodePayload(): void {}

    public encode(): void {
        this.writeByte(this.getId());
        this.encodePayload();
    }

    protected encodePayload(): void {}

    public readString(): string {
        return this.read(this.readShort()).toString('utf-8');
    }

    public writeString(v: string): void {
        const data = Buffer.from(v, 'utf-8');
        this.writeUnsignedShort(data.byteLength);
        this.write(data as any);
    }

    public readAddress(): InetAddress {
        const ver = this.readByte();
        if (ver === 4) {
            const ipBytes = this.read(4);
            const addr = `${(-ipBytes[0]! - 1) & 0xff}.${(-ipBytes[1]! - 1) & 0xff}.${(-ipBytes[2]! - 1) & 0xff}.${
                (-ipBytes[3]! - 1) & 0xff
            }`;
            const port = this.readShort();
            return new InetAddress(addr, port, ver);
        }

        this.skip(2); // Skip 2 bytes
        const port = this.readShort();
        this.skip(4); // Skip 4 bytes
        const addr = this.read(16).toString();
        this.skip(4); // Skip 4 bytes
        return new InetAddress(addr, port, ver);
    }

    public writeAddress(address: InetAddress): void {
        this.writeByte(4); // IPv4 only
        const bytes = address
            .getAddress()
            .split('.', 4)
            .map((v) => Number.parseInt(v, 10));
        // 10 should work perfectly fine, but maybe base2 is directly better...
        // TODO: see when will refactor this code soon
        for (const byte of bytes) {
            this.writeByte(~byte & 0xff);
        }
        this.writeUnsignedShort(address.getPort());
    }
}
