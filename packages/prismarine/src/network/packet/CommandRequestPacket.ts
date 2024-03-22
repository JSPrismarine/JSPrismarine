import CommandOriginData from '../type/CommandOriginData';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class CommandRequestPacket extends DataPacket {
    public static NetID = Identifiers.CommandRequestPacket;

    public commandName!: string;
    public commandOriginData!: CommandOriginData | null;
    public internal!: boolean;
    public version!: number;

    public decodePayload() {
        this.commandName = McpeUtil.readString(this);
        this.commandOriginData = CommandOriginData.networkDeserialize(this);
        this.internal = this.readBoolean();
        this.version = this.readVarInt();
    }
}
