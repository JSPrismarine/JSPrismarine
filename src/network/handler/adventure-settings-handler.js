const Player = require('../../player');
const Prismarine = require('../../prismarine');
const Identifiers = require('../identifiers');
const AdventureSettingsPacket = require('../packet/adventure-settings-packet');

class AdventureSettingsHandler {
    static NetID = Identifiers.AdventureSettingsPacket

    /**
     * @param {AdventureSettingsPacket} _packet 
     * @param {Prismarine} _server
     * @param {Player} _player 
     */
    static handle(_packet, _server, _player) {}
}

module.exports = AdventureSettingsHandler;
