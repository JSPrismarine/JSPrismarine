import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket';

export default class ServerSettingsRequestHandler implements PacketHandler<ServerSettingsRequestPacket> {
    public static NetID = Identifiers.ServerSettingsRequestPacket;

    public async handle(_packet: ServerSettingsRequestPacket, _server: Server, _session: PlayerSession): Promise<void> {
        // TODO: await session.sendSettings();
    }
}
