import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import uuid from '../../utils/UUID';

export default class EmoteListPacket extends DataPacket {
    public static NetID = Identifiers.EmoteListPacket;

    public runtimeId!: number;
    public emoteIds: Set<uuid> = new Set();

    public encodePayload() {
        this.writeUnsignedVarInt(this.runtimeId);
        this.writeUnsignedVarInt(this.emoteIds.size);

        for (const emote of this.emoteIds.values()) {
            this.writeUUID(emote);
        }
    }

    public decodePayload() {
        this.runtimeId = this.readUnsignedVarInt();
        const emoteCount = this.readUnsignedVarInt();

        for (let i = 0; i < emoteCount; i++) {
            this.emoteIds.add(this.readUUID());
        }
    }
}
