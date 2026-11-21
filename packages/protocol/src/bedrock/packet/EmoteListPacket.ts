import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { emoteListPacket } from '../wire/definitions/emoteList';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { EmoteListPayload } from '../wire/definitions/emoteList';

/** The fields of an `EmoteListPacket`, in wire order. */
export type EmoteList = EmoteListPayload;

/**
 * The emotes a client has equipped, sent to the server so other clients can download them.
 *
 * Bound to the server. Wire order: Runtime id as an `ActorRuntimeID`, a plain
 * LEB128 varuint64, then Emote piece ids as a varuint32 count followed by one `mce::UUID` per
 * emote, each written as its most significant and least significant uint64 halves in little
 * endian order.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/emote-list-packet/
 */
export default class EmoteListPacket extends NetworkPacket<EmoteList> {
    public get id(): number {
        return PacketIdentifier.EMOTE_LIST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: EmoteList): void {
        layoutAt(emoteListPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): EmoteList {
        return layoutAt(emoteListPacket, this.codecProtocol).decode(stream);
    }
}
