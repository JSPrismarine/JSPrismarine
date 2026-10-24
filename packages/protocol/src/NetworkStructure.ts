import type NetworkBinaryStream from './NetworkBinaryStream';

interface Constructor<T> {
    new (...args: any[]): T;
}

/**
 * Represents a network structure.
 */
export default abstract class NetworkStructure {
    /**
     * Serializes the network structure to a binary stream.
     * @param stream - The binary stream to serialize to.
     */
    public abstract serialize(stream: NetworkBinaryStream): void;

    /**
     * Deserializes the network structure from a binary stream.
     * @param stream - The binary stream to deserialize from.
     */
    public abstract deserialize(stream: NetworkBinaryStream): void;

    /**
     * Deserializes the network structure from a binary stream.
     * The constructor runs with no arguments before the stream is read, so
     * the class must tolerate that.
     * @param stream - The binary stream to deserialize from.
     * @returns An instance of the class T.
     */
    public static deserialize<T extends NetworkStructure>(this: Constructor<T>, stream: NetworkBinaryStream): T {
        const instance = new this();
        instance.deserialize(stream);
        return instance;
    }
}
