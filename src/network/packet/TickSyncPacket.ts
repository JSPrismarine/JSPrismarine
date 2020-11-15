import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class TickSyncPacket extends DataPacket {
    static NetID = Identifiers.TickSyncPacket;

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
