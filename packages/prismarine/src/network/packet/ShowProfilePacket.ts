import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ShowProfilePacket extends DataPacket {
    public static NetID = Identifiers.ShowProfilePacket;

    public xuid!: string;

    public decodePayload(): void {
        this.xuid = NetworkUtil.readString(this);
    }

    public encodePayload(): void {
        NetworkUtil.writeString(this, this.xuid);
    }
}
