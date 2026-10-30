import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The emotes a client has equipped, sent to the server so other clients can download them.
 *
 * Bound to the server. Wire order at protocol 2193: Runtime id as an `ActorRuntimeID`, a plain
 * LEB128 varuint64, then Emote piece ids as a varuint32 count followed by one `mce::UUID` per
 * emote, each written as its most significant and least significant uint64 halves in little
 * endian order.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/emote-list-packet/
 */
export default class EmoteListPacket extends FieldNetworkPacket {
    /** Runtime id of the player whose equipped emotes these are. */
    public runtimeId: bigint = 0n;

    /** The emote piece ids, one per equipped emote. */
    public emoteIds: UUID[] = [];

    /** Writes the runtime id, then the count and each uuid. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeId);
        this.writeUnsignedVarInt(this.emoteIds.length);

        for (const emote of this.emoteIds) {
            emote.networkSerialize(this);
        }
    }

    /** Reads the runtime id, then the count and each uuid. */
    public decodePayload(): void {
        this.runtimeId = this.readUnsignedVarLong();
        const emoteCount = this.readUnsignedVarInt();

        this.emoteIds = [];
        for (let i = 0; i < emoteCount; i++) {
            this.emoteIds.push(UUID.networkDeserialize(this));
        }
    }
}
