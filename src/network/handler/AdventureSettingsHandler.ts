import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type AdventureSettingsPacket from '../packet/AdventureSettingsPacket';
import PacketHandler from './PacketHandler';

export default class AdventureSettingsHandler
    implements PacketHandler<AdventureSettingsPacket> {
    public handle(
        packet: AdventureSettingsPacket,
        server: Prismarine,
        player: Player
    ): void {}
}
