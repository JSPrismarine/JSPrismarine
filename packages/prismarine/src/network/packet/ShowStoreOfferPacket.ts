import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';

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
