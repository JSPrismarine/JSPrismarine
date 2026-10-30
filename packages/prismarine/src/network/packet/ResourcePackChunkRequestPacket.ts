import { layoutAt, resourcePackChunkRequestPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The client asking for one chunk of a resource pack it is downloading.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `resourcePackChunkRequestPacket`
 * definition: Resource Name as a string (the pack's `uuid_version` as
 * `ResourcePackDataInfoPacket` named it), then Chunk as an int32 LE index.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-chunk-request-packet/
 */
export default class ResourcePackChunkRequestPacket extends FieldNetworkPacket {
    /** The pack id and version the server announced, joined by an underscore. */
    public resourceName = '';

    /** Zero-based index of the chunk wanted. */
    public chunk = 0;

    /** Reads the pack name and chunk index. */
    public decodePayload(): void {
        const read = layoutAt(resourcePackChunkRequestPacket, this.codecProtocol).decode(this);
        this.resourceName = read.resourceName;
        this.chunk = read.chunk;
    }

    /** Writes the pack name and chunk index. */
    public encodePayload(): void {
        layoutAt(resourcePackChunkRequestPacket, this.codecProtocol).encode(this, {
            resourceName: this.resourceName,
            chunk: this.chunk
        });
    }
}
