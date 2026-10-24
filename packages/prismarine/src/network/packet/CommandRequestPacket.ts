import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import CommandOriginData from '../type/CommandOriginData';
import DataPacket from './DataPacket';

export default class CommandRequestPacket extends DataPacket {
    public static NetID = Identifiers.CommandRequestPacket;

    public commandName!: string;
    public commandOriginData!: CommandOriginData | null;
    public internal!: boolean;

    /** A string rather than the number it used to be - `1.26.50` and the like. */
    public version!: string;

    public decodePayload(): void {
        this.commandName = NetworkUtil.readString(this);
        this.commandOriginData = CommandOriginData.networkDeserialize(this);
        this.internal = this.readBoolean();
        this.version = NetworkUtil.readString(this);
    }
}
