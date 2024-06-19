import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import CommandOriginData from '../type/CommandOriginData';
import DataPacket from './DataPacket';

export default class CommandRequestPacket extends DataPacket {
    public static NetID = Identifiers.CommandRequestPacket;

    public commandName!: string;
    public commandOriginData!: CommandOriginData | null;
    public internal!: boolean;
    public version!: number;

    public decodePayload(): void {
        this.commandName = NetworkUtil.readString(this);
        this.commandOriginData = CommandOriginData.networkDeserialize(this);
        this.internal = this.readBoolean();
        this.version = this.readVarInt();
    }
}
