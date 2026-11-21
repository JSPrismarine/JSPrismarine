/**
 * The editions a server speaks, each through a protocol provider: what releases it takes, under
 * which protocol numbers. Every version surface - the startup log, `/version` and `--version` -
 * lists the providers it is given, so an edition added here, or one an embedder passes the server,
 * shows up in all of them at once.
 *
 * The built-in providers read the protocol package's version tables only, never a codec, so the
 * command line can list them without loading the data the codecs carry.
 */
import type { ProtocolVersionDefinition } from '@jsprismarine/protocol/bedrock/ProtocolVersion';
import { newestRelease, ProtocolVersions } from '@jsprismarine/protocol/bedrock/ProtocolVersion';
import { JAVA_RELEASES, NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

/** One protocol an edition speaks and the releases that use it. */
export interface ProvidedProtocol {
    readonly protocolVersion: number;
    /** The releases on this protocol, in ascending order. */
    readonly minecraftVersions: readonly string[];
    /** Whether this is the protocol the edition advertises in server lists. */
    readonly advertised: boolean;
    /** Whether this protocol is a preview or snapshot, which is spoken but never advertised. */
    readonly preview: boolean;
}

/** An edition the server speaks. */
export interface ProtocolProvider {
    /** The edition's name as players know it, such as `Bedrock Edition`. */
    readonly edition: string;
    /** Every protocol the edition speaks, newest first. */
    protocols(): readonly ProvidedProtocol[];
}

/** Minecraft: Bedrock Edition, over the protocol versions the server has a codec for. */
export const bedrockProtocolProvider: ProtocolProvider = {
    edition: 'Bedrock Edition',
    protocols: () =>
        Object.values<ProtocolVersionDefinition>(ProtocolVersions)
            .toSorted((a, b) => b.protocolVersion - a.protocolVersion)
            .map((definition) => ({
                protocolVersion: definition.protocolVersion,
                minecraftVersions: definition.minecraftVersions,
                advertised: definition === newestRelease,
                preview: definition.preview === true
            }))
};

/** A Java snapshot's protocol number has bit 30 set, which no release's has. */
const JAVA_SNAPSHOT_BIT = 1 << 30;

/** Minecraft: Java Edition, over the releases the server has packet ids for. */
export const javaProtocolProvider: ProtocolProvider = {
    edition: 'Java Edition',
    protocols: () =>
        JAVA_RELEASES.map((release) => ({
            protocolVersion: release.protocolVersion,
            minecraftVersions: [release.minecraftVersion],
            advertised: release === NEWEST_JAVA_RELEASE,
            preview: (release.protocolVersion & JAVA_SNAPSHOT_BIT) !== 0
        }))
};

/** Every edition built into the server, whether a given server has it switched on or not. */
export const BUILT_IN_PROTOCOL_PROVIDERS: readonly ProtocolProvider[] = [bedrockProtocolProvider, javaProtocolProvider];

/**
 * One line per edition: its name, then each protocol's releases and number, newest first, such
 * as `Bedrock Edition: 1.26.60 (protocol 2225, advertised), 1.26.40, 1.26.41 (protocol 2193)`.
 * @param providers - The editions.
 * @param highlight - Wraps each release and number in `§e`/`§r`, for the startup log and chat.
 * @returns The lines, in the providers' order.
 */
export const describeProtocolProviders = (providers: readonly ProtocolProvider[], highlight = false): string[] => {
    const shown = (value: string | number): string => (highlight ? `§e${value}§r` : String(value));
    return providers.map(({ edition, protocols }) => {
        const listed = protocols().map(({ protocolVersion, minecraftVersions, advertised, preview }) => {
            const notes = [
                `protocol ${shown(protocolVersion)}`,
                ...(preview ? ['preview'] : []),
                ...(advertised ? ['advertised'] : [])
            ];
            return `${minecraftVersions.map(shown).join(', ')} (${notes.join(', ')})`;
        });
        return `${edition}: ${listed.join(', ')}`;
    });
};
