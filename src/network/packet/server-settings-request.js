const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


class ServerSettingsRequestPacket extends DataPacket {
    static NetID = Identifiers.ServerSettingsRequestPacket
}
module.exports = ServerSettingsRequestPacket;
