const DataPacket = require("./data_packet")

'use strict'

class ServerSettingsRequestPacket extends DataPacket {
    static NetID = 0x66
}
module.exports = ServerSettingsRequestPacket