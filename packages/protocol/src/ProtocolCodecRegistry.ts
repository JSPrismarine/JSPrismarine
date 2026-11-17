import type { ProtocolCodec } from './ProtocolCodec';
import { ProtocolCodecErrors } from '@jsprismarine/errors/protocol/codec';

/**
 * Builds a registry over codecs whose protocol versions must be unique.
 *
 * A preview codec exists to be ready for the release it precedes, so a registry holds at most
 * one, and it has to be newer than every release: an older preview is superseded by the release
 * it led up to, and nobody should still be on it.
 * @throws When two codecs share a version, the list is empty or holds no release, or the
 * previews break the rule above.
 */
export const buildCodecRegistry = (
    list: readonly ProtocolCodec[]
): { codecs: ReadonlyMap<number, ProtocolCodec>; latest: ProtocolCodec; advertised: ProtocolCodec } => {
    const codecs = new Map(list.map((codec) => [codec.protocolVersion, codec]));
    if (codecs.size !== list.length) throw new ProtocolCodecErrors.DuplicateCodecVersion();
    if (list.length === 0) throw new ProtocolCodecErrors.EmptyCodecRegistry();

    const newest = (candidates: readonly ProtocolCodec[]): ProtocolCodec | undefined =>
        candidates.reduce<ProtocolCodec | undefined>(
            (found, codec) => (found === undefined || codec.protocolVersion > found.protocolVersion ? codec : found),
            undefined
        );

    const previews = list.filter((codec) => codec.preview === true);
    const advertised = newest(list.filter((codec) => codec.preview !== true));
    if (advertised === undefined) throw new ProtocolCodecErrors.NoReleaseCodec();
    if (previews.length > 1) {
        throw new ProtocolCodecErrors.SeveralPreviewCodecs({
            previews: previews.map((codec) => codec.protocolVersion).join(', ')
        });
    }
    const [preview] = previews;
    if (preview !== undefined && preview.protocolVersion < advertised.protocolVersion) {
        throw new ProtocolCodecErrors.StalePreviewCodec({
            protocolVersion: preview.protocolVersion,
            advertisedProtocolVersion: advertised.protocolVersion
        });
    }

    return { codecs, latest: preview ?? advertised, advertised };
};

/** A lookup table and derived version summaries for configured codecs. */
export interface ProtocolCodecRegistry {
    /** Codecs keyed by protocol version. */
    readonly codecs: ReadonlyMap<number, ProtocolCodec>;
    /** The codec with the highest protocol version, which is the preview when there is one. */
    readonly latestCodec: ProtocolCodec;
    /**
     * The newest release codec: the version the server advertises in its MOTD and names to an
     * outdated client. A preview is negotiated but never advertised.
     */
    readonly advertisedCodec: ProtocolCodec;
    /** Codecs ordered newest protocol first. */
    readonly registeredCodecs: readonly ProtocolCodec[];
    /** Minecraft versions a client can join with, previews included, in ascending order. */
    readonly supportedMinecraftVersions: readonly string[];
    /** Finds a codec for a client's announced protocol version. */
    codecForProtocol(protocolVersion: number): ProtocolCodec | undefined;
}

/**
 * Builds protocol lookups and version summaries from codecs configured by a server.
 * @param list - Codecs with distinct protocol versions, at least one of them a release.
 * @returns The registry, newest and advertised codecs, and supported Minecraft release list.
 */
export const createProtocolCodecRegistry = (list: readonly ProtocolCodec[]): ProtocolCodecRegistry => {
    const { codecs, latest, advertised } = buildCodecRegistry(list);
    const registeredCodecs: readonly ProtocolCodec[] = [...codecs.values()].sort(
        (a, b) => b.protocolVersion - a.protocolVersion
    );
    const supportedMinecraftVersions = [...registeredCodecs].reverse().flatMap((codec) => codec.minecraftVersions);

    return {
        codecs,
        latestCodec: latest,
        advertisedCodec: advertised,
        registeredCodecs,
        supportedMinecraftVersions,
        codecForProtocol: (protocolVersion) => codecs.get(protocolVersion)
    };
};
