import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ShowStoreOfferPacket extends DataPacket {
    public static NetID = Identifiers.ShowStoreOfferPacket;

    public offerId!: string;
    public showAll!: boolean;

    public decodePayload() {
        this.offerId = NetworkUtil.readString(this);
        this.showAll = this.readBoolean();
    }

    public encodePayload() {
        NetworkUtil.writeString(this, this.offerId);
        this.writeBoolean(this.showAll);
    }
}
