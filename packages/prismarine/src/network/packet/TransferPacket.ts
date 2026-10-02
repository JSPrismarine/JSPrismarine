import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class TransferPacket extends DataPacket {
    public static NetID = Identifiers.TransferPacket;

    public address!: string;
    public port!: number;

    /** Whether the client reloads the world rather than tearing it down and building it again. */
    public reloadWorld = false;

    public decodePayload(): void {
        this.address = NetworkUtil.readString(this);
        this.port = this.readUnsignedShortLE();
        this.reloadWorld = this.readBoolean();
        if (this.readBoolean()) this.readUnsignedVarInt(); // gathering join info, unused
    }

    public encodePayload(): void {
        NetworkUtil.writeString(this, this.address);
        this.writeUnsignedShortLE(this.port);

        // Two bytes this had never written: `reloadWorld`, and the presence byte of the
        // gathering join info an earlier protocol added. Without them the packet ends two bytes
        // early and the client treats it as malformed instead of transferring.
        this.writeBoolean(this.reloadWorld);
        this.writeBoolean(false);
    }
}
