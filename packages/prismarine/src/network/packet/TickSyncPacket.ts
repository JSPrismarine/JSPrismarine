import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class TickSyncPacket extends DataPacket {
    public static NetID = Identifiers.TickSyncPacket;

    public clientRequestTimestamp!: bigint;
    public serverReceptionTimestamp!: bigint;

    public encodePayload() {
        this.writeLLong(this.clientRequestTimestamp);
        this.writeLLong(this.serverReceptionTimestamp);
    }

    public decodePayload() {
        this.clientRequestTimestamp = this.readLLong();
        this.serverReceptionTimestamp = this.readLLong();
    }
}
