import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class ShowStoreOfferPacket extends DataPacket {
    public static NetID = Identifiers.ShowStoreOfferPacket;

    public offerId!: string;
    public showAll!: boolean;

    public decodePayload() {
        this.offerId = McpeUtil.readString(this);
        this.showAll = this.readBoolean();
    }

    public encodePayload() {
        McpeUtil.writeString(this, this.offerId);
        this.writeBoolean(this.showAll);
    }
}
