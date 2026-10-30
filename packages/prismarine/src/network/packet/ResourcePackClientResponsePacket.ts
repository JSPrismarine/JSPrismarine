import { layoutAt, resourcePackClientResponsePacket } from '@jsprismarine/protocol';

import type ResourcePackStatusType from '../type/ResourcePackStatusType';
import DataPacket from './DataPacket';

/**
 * The client's answer to the resource pack exchange, packet 8.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `resourcePackClientResponsePacket`
 * definition. The payload is one field, `Response`, a `oneOf` of four alternatives: the
 * alternative index as a varuint32 (0 `Cancel`, 1 `Downloading`, 2 `DownloadingFinished`,
 * 3 `ResourcePackStackFinished`), then the alternative's `Response Type` as a string. Only
 * `Downloading` continues with `Downloading Packs`, a varuint32 count followed by that many
 * strings. The status is {@link ResourcePackStatusType}, the alternative index plus one.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-client-response-packet/
 */
export default class ResourcePackClientResponsePacket extends DataPacket {
    public status!: ResourcePackStatusType;
    public packIds: string[] = [];

    /**
     * Reads `Response`. The `Response Type` string is read and discarded; the alternative index
     * alone decides the status.
     * @throws when the alternative index names none of the four alternatives.
     */
    public decodePayload(): void {
        const { response } = layoutAt(resourcePackClientResponsePacket, this.codecProtocol).decode(this);
        this.status = response.status;
        this.packIds = response.packIds;
    }

    /**
     * Writes `Response` for the current status. The server never sends this packet; the client
     * package does, through its own copy in `@jsprismarine/protocol`.
     * @throws when the status has no alternative, which includes an unset status of 0.
     */
    public encodePayload(): void {
        layoutAt(resourcePackClientResponsePacket, this.codecProtocol).encode(this, {
            response: { status: this.status, packIds: this.packIds }
        });
    }
}
