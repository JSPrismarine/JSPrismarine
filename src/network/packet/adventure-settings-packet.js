const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;


class AdventureSettingsPacket extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket

    encodePayload() {
        // TODO
    }
}
module.exports = AdventureSettingsPacket;
