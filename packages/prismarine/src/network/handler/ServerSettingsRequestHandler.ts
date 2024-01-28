import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';
import type ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket.js';

export default class ServerSettingsRequestHandler implements PacketHandler<ServerSettingsRequestPacket> {
    public static NetID = Identifiers.ServerSettingsRequestPacket;

    public async handle(_packet: ServerSettingsRequestPacket, _server: Server, _session: PlayerSession): Promise<void> {
        // TODO: await session.sendSettings();
    }
}
