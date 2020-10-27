<<<<<<< HEAD
import Player from '../../player/Player';
import Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import AdventureSettingsPacket from '../packet/adventure-settings-packet';
=======
const Player = require('../../player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../Identifiers').default;
const AdventureSettingsPacket = require('../packet/adventure-settings-packet');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e

class AdventureSettingsHandler {
    static NetID = Identifiers.AdventureSettingsPacket

    /**
     * @param {AdventureSettingsPacket} _packet 
     * @param {Prismarine} _server
     * @param {Player} _player 
     */
    static handle(_packet, _server, _player) {}
}

export default AdventureSettingsHandler;
