import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Whether the client can keep a blob cache of chunk and block entity data.
 *
 * The client sends this once after login and expects nothing back. A server that wants to
 * use the cache answers later by marking its chunk packets as cached. This server never
 * does, so the flag is read and recorded but changes nothing about what gets sent. The
 * packet is decoded rather than ignored because a packet the registry has never heard of
 * is a warning on every join.
 * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json `packet_client_cache_status`
 */
export default class ClientCacheStatusPacket extends DataPacket {
    public static NetID = Identifiers.ClientCacheStatusPacket;

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
