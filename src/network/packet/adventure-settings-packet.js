const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


class AdventureSettingsPacket extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket

    encodePayload() {
        // TODO
    }
}
module.exports = AdventureSettingsPacket;
