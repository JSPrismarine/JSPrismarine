import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class EmoteListPacket extends DataPacket {
    public static NetID = Identifiers.EmoteListPacket;

    public runtimeId!: number;
    public emoteIds: Set<UUID> = new Set();

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.runtimeId);
        this.writeUnsignedVarInt(this.emoteIds.size);

        for (const emote of this.emoteIds.values()) {
            emote.networkSerialize(this);
        }
    }

    public decodePayload(): void {
        this.runtimeId = this.readUnsignedVarInt();
        const emoteCount = this.readUnsignedVarInt();

        for (let i = 0; i < emoteCount; i++) {
            this.emoteIds.add(UUID.networkDeserialize(this));
        }
    }
}
