import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

interface ScoreboardIdentityPacketEntry {
    entryID: bigint;
    entityUniqueID?: bigint;
}

export default class SetScoreboardIdentityPacket extends DataPacket {
    public static NetID = Identifiers.SetScoreboardIdentityPacket;

    public action!: number;
    public scoreboardIdentityEntries: ScoreboardIdentityPacketEntry[] = [];
    // FIXME: Client crashes when removing a score identity.
    public decodePayload() {
        this.action = this.readByte();
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; ++i) {
            let entry: ScoreboardIdentityPacketEntry = {} as any;

            entry!.entryID = this.readVarLong();
            if (this.action === 0) {
                entry!.entityUniqueID = this.readVarLong();
            }

            this.scoreboardIdentityEntries.push(entry!);
        }
    }

    public encodePayload() {
        this.writeByte(this.action);
        this.writeUnsignedVarInt(this.scoreboardIdentityEntries.length);
        this.scoreboardIdentityEntries.forEach((entry: ScoreboardIdentityPacketEntry) => {
            this.writeVarLong(entry.entryID);
            if (this.action === 0) {
                this.writeVarLong(entry.entityUniqueID ?? 0n);
            }
        });
    }
}
