const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

class ServerSettingsRequestPacket extends DataPacket {
    static NetID = Identifiers.ServerSettingsRequestPacket
}
module.exports = ServerSettingsRequestPacket