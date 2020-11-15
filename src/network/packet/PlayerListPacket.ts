import Identifiers from '../Identifiers';
import PlayerListAction from '../type/player-list-action';
import type PlayerListEntry from '../type/PlayerListEntry';
import DataPacket from './DataPacket';

export default class PlayerListPacket extends DataPacket {
    static NetID = Identifiers.PlayerListPacket;

    public entries: PlayerListEntry[] = [];
    public type!: number;

    public encodePayload() {
        this.writeByte(this.type);
        this.writeUnsignedVarInt(this.entries.length);
        for (let entry of this.entries) {
            if (this.type === PlayerListAction.Add) {
                this.writePlayerListAddEntry(entry);
            } else if (this.type === PlayerListAction.Remove) {
                this.writePlayerListRemoveEntry(entry);
            }
        }

        if (this.type === PlayerListAction.Add) {
            for (let entry of this.entries) {
                this.writeBool(entry.skin.isTrusted);
            }
        }
    }
}
