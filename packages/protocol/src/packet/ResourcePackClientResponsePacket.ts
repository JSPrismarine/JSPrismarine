import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The client's answer in a `ResourcePackClientResponsePacket`, numbered one above the wire's
 * alternative index so that `None` can stand for no answer yet.
 *
 * The docs page is https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-client-response-packet/
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
 */
export enum ResourcePackStatus {
    None,
    Refused,
    SendPacks,
    HaveAllPacks,
    Completed
}

/**
 * The `Response Type` string of each alternative, indexed by the alternative index.
 *
 * Real clients and gophertunnel send these in lower case. Mojang's docs list them as `Cancel`,
 * `Downloading`, `DownloadingFinished` and `ResourcePackStackFinished`. The lower case form is
 * the one proven on the wire, so it stays. Decoding discards the string, so either casing reads.
 */
const RESPONSE_TYPE_NAMES = ['cancel', 'downloading', 'downloadingfinished', 'resourcepackstackfinished'];

/**
 * What separates a status from its alternative index: `Refused` is 1 and `Cancel` is alternative 0.
 *
 * Protocol 2207 renumbers the docs enum to 1..4, which matches the status values. A bump past 2193
 * has to drop this offset.
 */
const ALTERNATIVE_OFFSET = 1;

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
 * The payload is one field, `Response`, a `oneOf` of four alternatives. It starts with the
 * alternative index as a varuint32 (0 `Cancel`, 1 `Downloading`, 2 `DownloadingFinished`,
 * 3 `ResourcePackStackFinished`), then the alternative's `Response Type` as a string. Only
 * `Downloading` continues with `Downloading Packs`, a varuint32 count followed by that many
 * strings. The status is {@link ResourcePackStatus}, which is the alternative index plus one.
 *
 * The schema types `Response Type` as an int8 and caps `Downloading Packs` at 65535 entries,
 * which reads like a one byte status and a uint16 count. That is the layout before protocol
 * 2193. Since the Cereal conversion the bytes are the ones above: a 1.26.51 client's
 * `DownloadingFinished` is `02 13` followed by the 19 bytes of `downloadingfinished`, and
 * gophertunnel at protocol 2193 writes the same. Until protocol 748 the list was written after
 * every alternative; a real server reads the two stray bytes as the next packet and drops the
 * connection.
 */
export default class ResourcePackClientResponsePacket extends NetworkPacket<ResourcePackResponse> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACK_CLIENT_RESPONSE;
    }

    /**
     * Writes `Response` for the given status.
     * @throws when the status has no alternative, which includes `None`.
     */
    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePackResponse): void {
        const selector = data.status - ALTERNATIVE_OFFSET;
        const name = RESPONSE_TYPE_NAMES[selector];
        if (name === undefined) throw new Error(`No resource pack response alternative for status ${data.status}`);

        stream.writeUnsignedVarInt(selector);
        stream.writeString(name);

        if (data.status !== ResourcePackStatus.SendPacks) return;

        stream.writeUnsignedVarInt(data.packIds.length);
        for (const id of data.packIds) {
            stream.writeString(id);
        }
    }

    /**
     * Reads `Response`. The `Response Type` string is read and discarded; the alternative index
     * alone decides the status.
     * @throws when the alternative index names none of the four alternatives.
     */
    protected deserializePayload(stream: NetworkBinaryStream): ResourcePackResponse {
        const selector = stream.readUnsignedVarInt();
        if (selector >= RESPONSE_TYPE_NAMES.length) {
            throw new Error(`Unknown resource pack response alternative ${selector}`);
        }

        const status = selector + ALTERNATIVE_OFFSET;
        stream.readString();

        if (status !== ResourcePackStatus.SendPacks) return { status, packIds: [] };

        const packIds: string[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            packIds.push(stream.readString());
        }

        return { status, packIds };
    }
}
