import AnimatePacket from '../packet/AnimatePacket';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type PlayerSession from '../PlayerSession';
import type Server from '../../Server';

export default class AnimateHandler implements PacketHandler<AnimatePacket> {
    public static NetID = Identifiers.AnimatePacket;

    public async handle(packet: AnimatePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const pk = new AnimatePacket();
        pk.runtimeEntityId = player.getRuntimeId();
        pk.action = packet.action;

        await Promise.all(
            server
                .getSessionManager()
                .getAllPlayers()
                .filter((onlinePlayer) => onlinePlayer !== player)
                .map(async (otherPlayer) => otherPlayer.getNetworkSession().getConnection().sendDataPacket(pk))
        );
    }
}
