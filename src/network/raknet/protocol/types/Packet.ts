import BinaryStream from "@jsprismarine/jsbinaryutils";
import { assert } from "console";

export default class Packet {
    private readonly inputStream: BinaryStream | null;
    private readonly outputStream: BinaryStream = new BinaryStream();
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

    public getID() {
        return this.id;
    }
}