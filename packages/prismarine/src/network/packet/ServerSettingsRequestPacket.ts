import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ServerSettingsRequestPacket extends DataPacket {
    public static NetID = Identifiers.ServerSettingsRequestPacket;

    public override getId(): number {
        return ServerSettingsRequestPacket.NetID;
    }

    public override getName(): string {
        return 'ServerSettingsRequestPacket';
    }
}
