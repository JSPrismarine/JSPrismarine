import type Server from '../Server';

/**
 * Builds the server name for RakNet.
 * @param {Server} server - The server instance.
 * @returns {string} The server name.
 *
 * @remarks
 * 1. "MCPE"
 * 2. [Server Software]
 * 3. [Protocol Version]
 * 4. [Minecraft Version]
 * 5. [Online Players]
 * 6. [Max Players]
 * 7. [Server GUID]
 * 8. [MOTD]
 * 9. [Gamemode]
 */
export const buildRakNetServerName = (server: Server, guid: bigint): string => {
    const config = server.getConfig();
    const onlinePlayers = server.getPlayerManager().getOnlinePlayers().length;
    const { Protocol, MinecraftVersions } = server.getIdentifiers();

    return `MCPE;JSPrismarine;${Protocol};${MinecraftVersions.at(0)};${onlinePlayers};${config.getMaxPlayers()};${guid};${config.getMotd()};${config.getGamemode()};`;
};
