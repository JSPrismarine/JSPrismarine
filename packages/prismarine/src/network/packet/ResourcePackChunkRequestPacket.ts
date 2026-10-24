import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The client asking for one chunk of a resource pack it is downloading.
 *
 * Wire layout at protocol 2193: Resource Name as a string (the pack's `uuid_version` as
 * `ResourcePackDataInfoPacket` named it), then Chunk as an int32 LE index.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/resource-pack-chunk-request-packet/
 */
export default class ResourcePackChunkRequestPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackChunkRequestPacket;

    /** The pack id and version the server announced, joined by an underscore. */
    public resourceName = '';

    /** Zero-based index of the chunk wanted. */
    public chunk = 0;

    /** Reads the pack name and chunk index. */
    public decodePayload(): void {
        this.resourceName = NetworkUtil.readString(this);
        this.chunk = this.readIntLE();
    }

    /** Writes the pack name and chunk index. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.resourceName);
        this.writeIntLE(this.chunk);
    }
}
