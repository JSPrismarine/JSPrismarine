import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ShowStoreOfferPacket extends DataPacket {
    public static NetID = Identifiers.ShowStoreOfferPacket;

    public offerId!: string;
    public showAll!: boolean;

    public decodePayload() {
        this.offerId = this.readString();
        this.showAll = this.readBool();
    }

    public encodePayload() {
        this.writeString(this.offerId);
        this.writeBool(this.showAll);
    }
}
