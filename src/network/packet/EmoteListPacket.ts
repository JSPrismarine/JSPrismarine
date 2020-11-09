import uuid from '../../utils/uuid';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class EmoteListPacket extends DataPacket {
    static NetID = Identifiers.EmoteListPacket;

    public runtimeId: number = 0;
    public emoteIds: Set<uuid> = new Set();

    public decodePayload() {
        this.runtimeId = this.readUnsignedVarInt();
        const emoteCount = this.readUnsignedVarInt();

        for (let i = 0; i < emoteCount; i++) {
            this.emoteIds.add(this.readUUID());
        }
    }
}
