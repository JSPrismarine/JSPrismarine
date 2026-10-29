import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client asking whether the server has a settings form to show it.
 *
 * The one correct answer is `ServerSettingsResponsePacket`, which carries a form id and the
 * form's UI JSON, and a server with no form to offer answers nothing at all. The request is
 * recorded at debug level and dropped. Known gap: the packet exists, but there is no form
 * system to build a form with, so the settings tab stays empty.
 *
 * This used to call `PlayerSession.sendSettings`, which despite the name builds an
 * `UpdateAdventureSettingsPacket`, the flags that decide whether a player may attack or
 * change the world. So opening the settings tab reapplied the client's adventure settings
 * and never put anything in the tab.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-settings-request-packet/
 */
export default class ServerSettingsRequestHandler implements PacketHandler<ServerSettingsRequestPacket> {
    public static PacketName = 'ServerSettingsRequestPacket';

    /** Logs the request and sends nothing back. */
    public handle(_packet: ServerSettingsRequestPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked for the server settings form, which the server does not offer`,
                'ServerSettingsRequestHandler/handle'
            );
    }
}
