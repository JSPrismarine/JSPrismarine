import { latestCodec, registeredCodecs } from './CodecRegistry';

/**
 * One human-readable phrase per registered codec, newest protocol version first, for the
 * startup banner and the `/version` command. Both read from the codec registry, so a codec
 * added there shows up in every diagnostic without a second list to maintain.
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
    registeredCodecs.map((codec) => {
        const versions = codec.minecraftVersions.map((version) => `§e${version}§r`).join(', ');
        const advertised = codec === latestCodec ? ' (advertised in the MOTD)' : '';
        return `protocol §e${codec.protocolVersion}§r: ${versions}${advertised}`;
    });
