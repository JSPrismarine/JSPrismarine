import type { ProtocolCodec } from './ProtocolCodec';

/** Builds a registry over codecs whose protocol versions must be unique. */
export const buildCodecRegistry = (
    list: readonly ProtocolCodec[]
): { codecs: ReadonlyMap<number, ProtocolCodec>; latest: ProtocolCodec } => {
    const codecs = new Map(list.map((codec) => [codec.protocolVersion, codec]));
    if (codecs.size !== list.length) throw new Error('Two codecs claim the same protocol version!');
    if (list.length === 0) throw new Error('A protocol codec registry requires at least one codec!');

    const latest = list.reduce((newest, codec) => (codec.protocolVersion > newest.protocolVersion ? codec : newest));
    return { codecs, latest };
};

/** A lookup table and derived version summaries for configured codecs. */
export interface ProtocolCodecRegistry {
    /** Codecs keyed by protocol version. */
    readonly codecs: ReadonlyMap<number, ProtocolCodec>;
    /** The codec with the highest protocol version. */
    readonly latestCodec: ProtocolCodec;
    /** Codecs ordered newest protocol first. */
    readonly registeredCodecs: readonly ProtocolCodec[];
    /** Minecraft versions supported by the registry, in ascending order. */
    readonly supportedMinecraftVersions: readonly string[];
    /** Finds a codec for a client's announced protocol version. */
    codecForProtocol(protocolVersion: number): ProtocolCodec | undefined;
}

/**
 * Builds protocol lookups and version summaries from codecs configured by a server.
 * @param list - Codecs with distinct protocol versions.
 * @returns The registry, newest codec, and supported Minecraft release list.
 */
export const createProtocolCodecRegistry = (list: readonly ProtocolCodec[]): ProtocolCodecRegistry => {
    const { codecs, latest } = buildCodecRegistry(list);
    const registeredCodecs: readonly ProtocolCodec[] = [...codecs.values()].sort(
        (a, b) => b.protocolVersion - a.protocolVersion
    );
    const supportedMinecraftVersions = [...registeredCodecs].reverse().flatMap((codec) => codec.minecraftVersions);

    return {
        codecs,
        latestCodec: latest,
        registeredCodecs,
        supportedMinecraftVersions,
        codecForProtocol: (protocolVersion) => codecs.get(protocolVersion)
    };
};
