import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { resourcePackClientResponsePacket } from '../wire/definitions/resourcePacks';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The client's answer in a `ResourcePackClientResponsePacket`, numbered one above the wire's
 * alternative index so that `None` can stand for no answer yet.
 *
 * The docs page is https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/resource-pack-client-response-packet/
 * and names the alternatives differently:
 * - `None` has no wire form. Encoding it throws.
 * - `Refused` is `Cancel`, alternative 0.
 * - `SendPacks` is `Downloading`, alternative 1, the only one followed by a `Downloading Packs` list.
 * - `HaveAllPacks` is `DownloadingFinished`, alternative 2.
 * - `Completed` is `ResourcePackStackFinished`, alternative 3.
 *
 * `ResourcePackResponse` from `@jsprismarine/minecraft` is the generated equivalent, with the docs
 * names and the same values (`CANCEL` = 1 through `RESOURCE_PACK_STACK_FINISHED` = 4). This enum
 * stays exported under its own names because the client package depends on them.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/resource-pack-client-response-packet/
 */
export enum ResourcePackStatus {
    None,
    Refused,
    SendPacks,
    HaveAllPacks,
    Completed
}

/** The decoded `Response`: a status and, for `SendPacks` only, the packs the client is downloading. */
export interface ResourcePackResponse {
    status: ResourcePackStatus;
    /** `Downloading Packs`. Empty for every status other than `SendPacks`. */
    packIds: string[];
}

/**
 * The client's answer to the resource pack exchange, packet 8. A normal join sends it twice:
 * `HaveAllPacks` to get the stack, then `Completed` to be let into the world.
 *
 * The payload is one `Response` field, a `oneOf` of four alternatives. The wire layout, and the
 * reason it differs from the schema's int8 and uint16 reading, live in the packet's declarative
 * definition. The status is {@link ResourcePackStatus}, which is the alternative index plus one.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/resource-pack-client-response-packet/
 */
export default class ResourcePackClientResponsePacket extends NetworkPacket<ResourcePackResponse> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACK_CLIENT_RESPONSE;
    }

    /** Writes `Response` for the given status. Throws when the status has no alternative, `None` included. */
    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePackResponse): void {
        layoutAt(resourcePackClientResponsePacket, this.codecProtocol).encode(stream, { response: data });
    }

    /** Reads `Response`. Throws when the alternative index names none of the four alternatives. */
    protected deserializePayload(stream: NetworkBinaryStream): ResourcePackResponse {
        return layoutAt(resourcePackClientResponsePacket, this.codecProtocol).decode(stream).response;
    }
}
