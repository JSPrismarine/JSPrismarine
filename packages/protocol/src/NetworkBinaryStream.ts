import BinaryStream from '@jsprismarine/jsbinaryutils';

/**
 * Represents an extended version of the BinaryStream class that includes
 * minecraft-specific serialization methods.
 */
export default class NetworkBinaryStream extends BinaryStream {
    /**
     * Reads a string from the stream.
     * {@link https://mojang.github.io/bedrock-protocol-docs/html/string.html | Not documented in the protocol docs}
     * @returns The read string.
     */
    public readString(): string {
        return this.readLengthPrefixed().toString('utf-8');
    }

    /**
     * Writes a string to the stream.
     * @param str - The string to write.
     */
    public writeString(str: string): void {
        this.writeLengthPrefixed(Buffer.from(str, 'utf-8'));
    }

    /**
     * Reads a length-prefixed ASCII string from the stream.
     * {@link https://mojang.github.io/bedrock-protocol-docs/html/string.html | Not documented in the protocol docs}
     * @returns The read string.
     */
    public readLELengthASCIIString(): string {
        return this.read(this.readUnsignedIntLE()).toString('ascii');
    }

    /**
     * Writes a length-prefixed ASCII string to the stream.
     * @param str - The string to write.
     */
    public writeLELengthASCIIString(str: string): void {
        const buf = Buffer.from(str, 'ascii');
        this.writeUnsignedIntLE(buf.byteLength);
        this.write(buf);
    }

    /**
     * Reads a length-prefixed buffer from the stream.
     * @returns The length-prefixed buffer.
     */
    public readLengthPrefixed(): Buffer {
        return this.read(this.readUnsignedVarInt());
    }

    /**
     * Writes a length-prefixed buffer to the stream.
     * @param buf - The buffer to append.
     */
    public writeLengthPrefixed(buf: Buffer): void {
        this.writeUnsignedVarInt(buf.byteLength);
        this.write(buf);
    }
}
