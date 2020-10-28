const Player = require('../../player/Player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../Identifiers').default;
const AdventureSettingsPacket = require('../packet/adventure-settings-packet');
const DataPacket = require('../packet/Packet').default;

class AdventureSettingsHandler extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket

    /**
     * @param {AdventureSettingsPacket} _packet 
     * @param {Prismarine} _server
     * @param {Player} _player 
     */
    static handle(_packet, _server, _player) { }
}

module.exports = AdventureSettingsHandler;
