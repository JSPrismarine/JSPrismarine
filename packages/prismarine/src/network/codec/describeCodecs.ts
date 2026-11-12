import { about } from '../../about';

/**
 * One human-readable phrase per protocol the server speaks, newest protocol version first, for
 * the startup banner and the `/version` command. Both read from {@link about}, so a codec
 * added to the registry shows up in every diagnostic without a second list to maintain.
 *
 * The newest entry is marked as advertised: `ServerName` puts only the newest Minecraft
 * version in the MOTD, matching Bedrock Dedicated Server, while a session may still negotiate
 * any of the others.
 * @returns {string[]} phrases such as `protocol §e2225§r: §e1.26.60§r (advertised in the MOTD)`,
 * carrying the banner's color codes.
 * @example
 * ```typescript
 * logger.info(`Speaking ${describeSupportedProtocols().join(', ')}`);
 * ```
 */
export const describeSupportedProtocols = (): string[] =>
    about().protocols.map((protocol) => {
        const versions = protocol.minecraftVersions.map((version) => `§e${version}§r`).join(', ');
        const advertised = protocol.advertised ? ' (advertised in the MOTD)' : '';
        return `protocol §e${protocol.protocolVersion}§r: ${versions}${advertised}`;
    });
