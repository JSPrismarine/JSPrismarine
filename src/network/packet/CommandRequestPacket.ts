import Identifiers from '../Identifiers';
import CommandOriginData from '../type/command-origin-data';
import DataPacket from './DataPacket';

export default class CommandRequestPacket extends DataPacket {
    static NetID = Identifiers.CommandRequestPacket;

    public commandName: string = '';
    public commandOriginData: CommandOriginData | null = null;
    public internal: boolean = false;

    public decodePayload() {
        this.commandName = this.readString();
        this.commandOriginData = this.readCommandOriginData();
        this.internal = this.readBool();
    }
}
