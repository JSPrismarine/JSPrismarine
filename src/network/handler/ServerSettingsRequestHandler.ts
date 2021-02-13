import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import type ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket';

export default class ServerSettingsRequestHandler implements PacketHandler<ServerSettingsRequestPacket> {
    public async handle(packet: ServerSettingsRequestPacket, server: Server, player: Player): Promise<void> {
        await player.getConnection().sendSettings();
    }
}
