const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class AdventureSettingsPacket extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket

    encodePayload() {
        // TODO
    }
}
module.exports = AdventureSettingsPacket