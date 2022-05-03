import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

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
            entry!.objectiveName = McpeUtil.readString(this);
            entry!.score = this.readIntLE();
            if (this.action !== 1) {
                entry!.identityType = this.readByte();
                if (entry!.identityType !== 3) {
                    entry!.entityUniqueID = this.readVarLong();
                } else {
                    entry!.displayName = McpeUtil.readString(this);
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
            McpeUtil.writeString(this, entry.objectiveName);
            this.writeIntLE(entry.score);
            if (this.action !== 1) {
                this.writeByte(entry.identityType);
                if (entry.identityType !== 3) {
                    this.writeVarLong(entry.entityUniqueID ?? 0n);
                } else {
                    McpeUtil.writeString(this, entry.displayName ?? 'empty');
                }
            }
        });
    }
}
