import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ServerSettingsRequestPacket extends DataPacket {
    public static NetID = Identifiers.ServerSettingsRequestPacket;
}
