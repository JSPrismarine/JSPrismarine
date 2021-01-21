import BinaryStream from '@jsprismarine/jsbinaryutils';
import InetAddress from '../utils/InetAddress';

export default class Packet extends BinaryStream {
    private readonly id: number;

    public constructor(id: number, buffer?: Buffer) {
        super(buffer);
        this.id = id;
    }

    public getId(): number {
        return this.id;
    }

    // Decodes packet buffer
    public decode(): void {
        this.readByte(); // Skip the packet ID
        this.decodePayload();
    }

    protected decodePayload(): void {}

    // Encodes packet buffer
    public encode() {
        this.writeByte(this.getId());
        this.encodePayload();
    }

    protected encodePayload(): void {}

    // Reads a string from the buffer
    public readString(): string {
        return this.read(this.readShort()).toString();
    }

    // Writes a string length + buffer
    // valid only for offline packets
    public writeString(v: string): void {
        this.writeShort(Buffer.byteLength(v));
        this.append(Buffer.from(v, 'utf-8'));
    }

    // Reads a RakNet address passed into the buffer
    public readAddress() {
        const ver = this.readByte();
        if (ver === 4) {
            // Read 4 bytes
            const ipBytes = this.getBuffer().slice(this.getOffset(), this.addOffset(4, true));
            const addr = `${(-ipBytes[0] - 1) & 0xff}.${(-ipBytes[1] - 1) & 0xff}.${
                (-ipBytes[2] - 1) & 0xff
            }.${(-ipBytes[3] - 1) & 0xff}`;
            const port = this.readShort();
            return new InetAddress(addr, port, ver);
        }

        this.addOffset(2, true); // Skip 2 bytes
        const port = this.readShort();
        this.addOffset(4, true); // Skip 4 bytes
        const addr = this.getBuffer().slice(this.getOffset(), this.addOffset(16, true)).toString();
        this.addOffset(4, true); // Skip 4 bytes
        return new InetAddress(addr, port, ver);
    }

    // Writes an IPv4 address into the buffer
    // Needs to get refactored, also needs to be added support for IPv6
    public writeAddress(address: InetAddress): void {
        this.writeByte(address.getVersion() ?? 4);
        address
            .getAddress()
            .split('.', 4)
            .forEach((b) => {
                this.writeByte(-b - 1);
            });
        this.writeShort(address.getPort());
    }
}
