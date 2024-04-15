import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class DisconnectPacket extends DataPacket {
    public static NetID = Identifiers.DisconnectPacket;

    public reason!: number;
    public skipMessage!: boolean;
    public message!: string;

    public encodePayload(): void {
        this.writeVarInt(this.reason);
        this.writeBoolean(this.skipMessage);

        if (!this.skipMessage) NetworkUtil.writeString(this, this.message);
    }

    public decodePayload(): void {
        this.reason = this.readVarInt();
        this.skipMessage = this.readBoolean();

        if (!this.skipMessage) this.message = NetworkUtil.readString(this);
    }
}
