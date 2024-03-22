import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class TickSyncPacket extends DataPacket {
    public static NetID = Identifiers.TickSyncPacket;

    public clientRequestTimestamp!: bigint;
    public serverReceptionTimestamp!: bigint;

    public encodePayload() {
        this.writeLongLE(this.clientRequestTimestamp);
        this.writeLongLE(this.serverReceptionTimestamp);
    }

    public decodePayload() {
        this.clientRequestTimestamp = this.readLongLE();
        this.serverReceptionTimestamp = this.readLongLE();
    }
}
