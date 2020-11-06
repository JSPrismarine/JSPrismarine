import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ServerSettingsRequestPacket extends DataPacket {
    static NetID = Identifiers.ServerSettingsRequestPacket;
}
