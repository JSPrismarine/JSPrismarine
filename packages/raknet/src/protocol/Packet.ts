import BinaryStream from '@jsprismarine/binaryutils';
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

    /**
     * Reads a RakNet string: an unsigned 16 bit big-endian byte length, then the bytes.
     *
     * Unsigned to match {@link writeString}, which has always written the length with
     * `writeUnsignedShort`. Read signed, any string of 32768 bytes or more came back with a
     * negative length, and `read` then walked the cursor backwards over data it had already
     * consumed instead of failing.
     */
    public readString(): string {
        return this.read(this.readUnsignedShort()).toString('utf-8');
    }

    public writeString(v: string): void {
        const data = Buffer.from(v, 'utf-8');
        this.writeUnsignedShort(data.byteLength);
        this.write(data);
    }

    /**
     * Reads a RakNet `SystemAddress`: a version byte, the address, then the port.
     *
     * The port is unsigned. RakNet serializes it as `unsigned short` and
     * {@link writeAddress} writes it with `writeUnsignedShort`, so reading it signed turned
     * every ephemeral port from 32768 up - which is the range an operating system hands a
     * connecting client from - into a negative number.
     */
    public readAddress(): InetAddress {
        const ver = this.readByte();
        if (ver === 4) {
            const ipBytes = this.read(4);
            const addr = `${(-ipBytes[0]! - 1) & 0xff}.${(-ipBytes[1]! - 1) & 0xff}.${(-ipBytes[2]! - 1) & 0xff}.${
                (-ipBytes[3]! - 1) & 0xff
            }`;
            const port = this.readUnsignedShort();
            return new InetAddress(addr, port, ver);
        }

        this.skip(2); // Skip 2 bytes
        const port = this.readUnsignedShort();
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
