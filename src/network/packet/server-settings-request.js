const DataPacket = require('./DataPacket').default;
const Identifiers = require('../Identifiers').default;

class ServerSettingsRequestPacket extends DataPacket {
    static NetID = Identifiers.ServerSettingsRequestPacket;
}
module.exports = ServerSettingsRequestPacket;
