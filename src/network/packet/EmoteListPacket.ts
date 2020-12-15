import uuid from '../../utils/UUID';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class EmoteListPacket extends DataPacket {
    static NetID = Identifiers.EmoteListPacket;

    public runtimeId!: number;
    public emoteIds: Set<uuid> = new Set();

    public encodePayload() {
        this.writeUnsignedVarInt(this.runtimeId);
        this.writeUnsignedVarInt(this.emoteIds.size);

        for (let emote of this.emoteIds.values()) {
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
