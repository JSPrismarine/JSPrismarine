const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;


class ServerSettingsRequestPacket extends DataPacket {
    static NetID = Identifiers.ServerSettingsRequestPacket
}
module.exports = ServerSettingsRequestPacket;
