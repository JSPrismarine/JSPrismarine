import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The emotes a client has equipped, sent to the server so other clients can download them.
 *
 * Bound to the server. Wire order at protocol 2193: Runtime id as an `ActorRuntimeID`, a plain
 * LEB128 varuint64, then Emote piece ids as a varuint32 count followed by one `mce::UUID` per
 * emote, each written as its most significant and least significant uint64 halves in little
 * endian order.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/emote-list-packet/
 */
export default class EmoteListPacket extends DataPacket {
    public static NetID = Identifiers.EmoteListPacket;

    public runtimeId: bigint = 0n;
    public emoteIds: UUID[] = [];

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeId);
        this.writeUnsignedVarInt(this.emoteIds.length);

        for (const emote of this.emoteIds) {
            emote.networkSerialize(this);
        }
    }

    public decodePayload(): void {
        this.runtimeId = this.readUnsignedVarLong();
        const emoteCount = this.readUnsignedVarInt();

        this.emoteIds = [];
        for (let i = 0; i < emoteCount; i++) {
            this.emoteIds.push(UUID.networkDeserialize(this));
        }
    }
}
