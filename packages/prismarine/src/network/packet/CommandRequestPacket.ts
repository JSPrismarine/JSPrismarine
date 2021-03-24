import CommandOriginData from '../type/CommandOriginData';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class CommandRequestPacket extends DataPacket {
    public static NetID = Identifiers.CommandRequestPacket;

    public commandName!: string;
    public commandOriginData!: CommandOriginData | null;
    public internal!: boolean;

    public decodePayload() {
        this.commandName = this.readString();
        this.commandOriginData = CommandOriginData.networkDeserialize(this);
        this.internal = this.readBool();
    }
}
