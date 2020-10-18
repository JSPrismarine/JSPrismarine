import Player from '../../player/Player';
import Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import AdventureSettingsPacket from '../packet/adventure-settings-packet';

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
