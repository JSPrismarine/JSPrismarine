import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket';
import type PacketHandler from './PacketHandler';

export default class ServerSettingsRequestHandler implements PacketHandler<ServerSettingsRequestPacket> {
    public static NetID = Identifiers.ServerSettingsRequestPacket;

    public async handle(_packet: ServerSettingsRequestPacket, _server: Server, session: PlayerSession): Promise<void> {
        await session.sendSettings();
    }
}
