import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class TickSyncPacket extends DataPacket {
    public static NetID = Identifiers.TickSyncPacket;

    public override getId(): number {
        return TickSyncPacket.NetID;
    }

    public override getName(): string {
        return 'TickSyncPacket';
    }

    public clientRequestTimestamp!: bigint;
    public serverReceptionTimestamp!: bigint;

    public encodePayload(): void {
        this.writeLongLE(this.clientRequestTimestamp);
        this.writeLongLE(this.serverReceptionTimestamp);
    }

    public decodePayload(): void {
        this.clientRequestTimestamp = this.readLongLE();
        this.serverReceptionTimestamp = this.readLongLE();
    }
}
