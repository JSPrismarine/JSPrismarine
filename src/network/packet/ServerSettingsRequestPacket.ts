import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ServerSettingsRequestPacket extends DataPacket {
    static NetID = Identifiers.ServerSettingsRequestPacket;
}
