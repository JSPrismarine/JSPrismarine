import type AdventureSettingsPacket from '../packet/AdventureSettingsPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class AdventureSettingsHandler
    implements PacketHandler<AdventureSettingsPacket> {
    public handle(
        packet: AdventureSettingsPacket,
        server: Server,
        player: Player
    ): void {}
}
