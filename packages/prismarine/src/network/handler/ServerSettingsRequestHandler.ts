import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';
import type ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket';

export default class ServerSettingsRequestHandler implements PacketHandler<ServerSettingsRequestPacket> {
    public static NetID = Identifiers.ServerSettingsRequestPacket;

    public async handle(
        _packet: ServerSettingsRequestPacket,
        _server: Server,
        connection: PlayerConnection
    ): Promise<void> {
        await connection.sendSettings();
    }
}
