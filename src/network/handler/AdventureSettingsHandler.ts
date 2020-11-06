import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type AdventureSettingsPacket from '../packet/AdventureSettingsPacket';

const Identifiers = require('../Identifiers').default;

export default class AdventureSettingsHandler {
    static NetID = Identifiers.AdventureSettingsPacket;

    static handle(
        packet: AdventureSettingsPacket,
        server: Prismarine,
        player: Player
    ) {}
}
