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

    public action!: number;
    public scoreEntries: ScorePacketEntry[] = [];

    public decodePayload() {
        this.action = this.readByte();
        for (let i = 0, i2 = this.readUnsignedVarInt(); i < i2; ++i) {
            let entry: ScorePacketEntry;
            entry!.entryID = this.readVarLong();
            entry!.objectiveName = this.readString();
            entry!.score = this.readIntLE();
            if (this.action !== 1) {
                entry!.identityType = this.readByte();
                if (entry!.identityType !== 3) {
                    entry!.entityUniqueID = this.readVarLong();
                } else {
                    entry!.displayName = this.readString();
                }
            }
            this.scoreEntries.push(entry!);
        }
    }

    public encodePayload() {
        this.writeByte(this.action);
        this.writeUnsignedVarInt(this.scoreEntries.length);
        this.scoreEntries.forEach((entry: ScorePacketEntry) => {
            this.writeVarLong(entry.entryID);
            this.writeString(entry.objectiveName);
            this.writeIntLE(entry.score);
            if (this.action !== 1) {
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
