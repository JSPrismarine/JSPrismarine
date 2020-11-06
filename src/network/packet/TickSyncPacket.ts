import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class TickSyncPacket extends DataPacket {
    static NetID = Identifiers.TickSyncPacket;

    public clientRequestTimestamp: bigint = BigInt(0);
    public serverReceptionTimestamp: bigint = BigInt(0);

    public decodePayload() {
        this.clientRequestTimestamp = this.readLLong();
        this.serverReceptionTimestamp = this.readLLong();
    }
}
