import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** @see https://mojang.github.io/bedrock-protocol-docs/html/ResourcePackClientResponsePacket.html */
export enum ResourcePackStatus {
    None,
    Refused,
    SendPacks,
    HaveAllPacks,
    Completed
}

/**
 * The alternatives, in selector order, spelled as the wire spells them.
 *
 * Lower case and run together, and sent in full beside the number that already identifies
 * them. Kept as data because they are not derivable from the enum's names: `SendPacks` travels
 * as `downloading`, and the two are the same alternative under different names.
 */
const ALTERNATIVE_NAMES = ['cancel', 'downloading', 'downloadingfinished', 'resourcepackstackfinished'];

export interface ResourcePackResponse {
    status: ResourcePackStatus;
    packIds: string[];
}

/**
 * The client's half of the resource pack exchange, sent twice in a normal join:
 * `HaveAllPacks` to get the stack, then `Completed` to be let into the world.
 *
 * The response is a variant, and it names itself twice: a zero based selector, then the
 * alternative's name as a string. The enum counts from one, so the selector is one less than
 * the status - and the name is redundant with it, but the server reads it and a connection
 * that omits it goes no further.
 *
 * Only `SendPacks` carries a list. 748 wrote one unconditionally, so the two bytes of an empty
 * one followed every response; at 2168 the server reads those as the start of the next packet
 * and drops the connection without answering.
 */
export default class ResourcePackResponsePacket extends NetworkPacket<ResourcePackResponse> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACK_CLIENT_RESPONSE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePackResponse): void {
        const selector = data.status - 1;
        const name = ALTERNATIVE_NAMES[selector];
        if (name === undefined) throw new Error(`No resource pack response alternative for status ${data.status}`);

        stream.writeUnsignedVarInt(selector);
        stream.writeString(name);

        if (data.status !== ResourcePackStatus.SendPacks) return;

        stream.writeUnsignedVarInt(data.packIds.length);
        for (const id of data.packIds) {
            stream.writeString(id);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ResourcePackResponse {
        const status = stream.readUnsignedVarInt() + 1;
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
