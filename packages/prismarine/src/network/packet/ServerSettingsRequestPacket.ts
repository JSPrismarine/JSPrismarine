import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class ServerSettingsRequestPacket extends DataPacket {
    public static NetID = Identifiers.ServerSettingsRequestPacket;
}
