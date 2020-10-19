import BinaryStream from "@jsprismarine/jsbinaryutils";
import { assert } from "console";
import InetAddress from "../../util/InetAddress";

export default class Packet {
    protected readonly inputStream: BinaryStream | null;
    protected readonly outputStream: BinaryStream = new BinaryStream();
    protected id: number = -1;

    constructor(buffer?: Buffer) {
        // Avoid creating useless BinaryStream instances
        this.inputStream = buffer ? new BinaryStream(buffer) : null;
    }

    public encodeInternal(): void {
        this.encodeHeader(this.outputStream);
        this.encode(this.outputStream);
    }

    protected encodeHeader(stream: BinaryStream): void {
        stream.writeByte(this.id);
    }

    protected encode(_: BinaryStream): void {}

    // Then surround with try / catch and: log("Cannot decode packet %id: %e", id, error);
    public decodeInternal(): void {
        if (!this.inputStream) {
            throw new Error("No given InputStream");
        } 
        this.decodeHeader(this.inputStream);
        this.decode(this.inputStream);
    }

    protected decodeHeader(stream: BinaryStream): void {
        const id = stream.readByte();
        assert(id === this.id, "RakNet packet id mismatch got %d expected {%d}", id, this.id);
    }

    protected decode(_: BinaryStream): void {}

    ///////////////// UTILS /////////////////

    public encodeString(text: string): void {
        this.outputStream.writeShort(text.length);
        this.outputStream.append(Buffer.from(text, 'utf8'));
    }

    public decodeString(): string {
        if (!this.inputStream) {
            throw new Error("No given InputStream");
        } 
        const len = this.inputStream.readShort();
        return this.inputStream.read(len).toString();
    }

    // TODO: IPv6 support
    public encodeAddress(address: InetAddress): void {
        this.outputStream.writeByte(4); 
        const splits = address.getAddress().split(".", 4);
        for (const split of splits) {
            this.outputStream.writeByte(-split-1);
        }
        this.outputStream.writeShort(address.getPort());
    }

    public decodeAddress(): InetAddress {
        if (!this.inputStream) {
            throw new Error("No given InputStream");
        } 
        this.inputStream.readByte();
        const ipBytes = this.inputStream.getBuffer().slice(
            this.inputStream.getOffset(), this.inputStream.addOffset(4, true)
        )
        const addr = `${(-ipBytes[0]-1)&0xff}.${(-ipBytes[1]-1)&0xff}.${(-ipBytes[2]-1)&0xff}.${(-ipBytes[3]-1)&0xff}`;
        const port = this.inputStream.readShort();
        return new InetAddress({ address: addr, port: port, family: "IPv4" });
    }

    /////////////////////////////////////////

    public getID(): number {
        return this.id;
    }

    public getIntputStream(): Buffer {
        return this.inputStream?.getBuffer() ?? Buffer.alloc(0);
    }

    public getOutputBuffer(): Buffer {
        return this.outputStream.getBuffer();
    }
}