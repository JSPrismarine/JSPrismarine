import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

interface ScorePacketEntry {
    entryID: bigint;
    objectiveName: string;
    score: number;
    identityType: number;
    entityUniqueID?: bigint;
    displayName?: string;
}

export default class SetScorePacket extends DataPacket {
    public static NetID = Identifiers.SetScorePacket;

    public Action!: number;
    public ScoreEntries!: ScorePacketEntry[];

    public decodePayload() {
        this.Action = this.readByte();
        for (let i = 0, i2 = this.readUnsignedVarInt(); i < i2; ++i) {
            let entry: ScorePacketEntry;
            entry!.entryID = this.readVarLong();
            entry!.objectiveName = this.readString();
            entry!.score = this.readLInt();
            if (this.Action !== 1) {
                entry!.identityType = this.readByte();
                if (entry!.identityType !== 3) {
                    entry!.entityUniqueID = this.readVarLong();
                } else {
                    entry!.displayName = this.readString();
                }
            }
            this.ScoreEntries.push(entry!);
        }
    }

    public encodePayload() {
        this.writeByte(this.Action);
        this.writeUnsignedVarInt(this.ScoreEntries.length);
        this.ScoreEntries.forEach((entry: ScorePacketEntry) => {
            this.writeVarLong(entry.entryID);
            this.writeString(entry.objectiveName);
            this.writeLInt(entry.score);
            if (this.Action !== 1) {
                this.writeByte(entry.identityType);
                if (entry.identityType !== 3) {
                    this.writeVarLong(entry.entityUniqueID ?? 0n);
                } else {
                    this.writeString(entry.displayName ?? 'empty');
                }
            }
        });
    }
}
