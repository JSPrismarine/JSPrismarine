import DataPacket from './DataPacket';

/**
 * Whether the client can keep a blob cache of chunk and block entity data.
 *
 * The client sends this once after login and expects nothing back. A server that wants to
 * use the cache answers later by marking its chunk packets as cached. This server never
 * does, so the flag is read and recorded but changes nothing about what gets sent. The
 * packet is decoded rather than ignored because a packet the registry has never heard of
 * is a warning on every join.
 * Wire layout at protocol 2193: `Is cache supported?` as one boolean byte.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/client-cache-status-packet/
 */
export default class ClientCacheStatusPacket extends DataPacket {
    /** `true` when the client offers to keep a blob cache. */
    public enabled = false;

    /** Reads the single flag the client sends. */
    public decodePayload(): void {
        this.enabled = this.readBoolean();
    }

    /** Writes the flag, for tests and for a client built on this package. */
    public encodePayload(): void {
        this.writeBoolean(this.enabled);
    }
}
