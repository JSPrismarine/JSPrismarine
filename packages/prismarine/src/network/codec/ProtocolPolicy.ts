/**
 * Which client protocols a server accepts and which release its world's content comes from
 * ([ADR 0025](../../../../../docs/adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
 *
 * Both settings count from the newest release this build has a codec for, so upgrading the
 * server moves the window forward with no config change. A preview is negotiated with a client
 * that announces it and is not counted in the window.
 */
import type { ProtocolCodec } from '@jsprismarine/protocol';

import { registeredCodecs } from './CodecRegistry';

/** Which release in the window the world's content comes from. */
export type ProtocolContent = 'newest' | 'oldest';

/** What `config.json` says about protocols, before it is resolved against this build's codecs. */
export interface ProtocolSettings {
    /** How many releases to accept, counted back from the newest. */
    readonly window: number;
    /** Which release in the window the world's content comes from. */
    readonly content: ProtocolContent;
}

/** The settings a server without any runs on: the newest release only, with its content. */
export const DEFAULT_PROTOCOL_SETTINGS: ProtocolSettings = { window: 1, content: 'newest' };

/** The settings resolved against the codecs this build ships. */
export interface ProtocolPolicy {
    /** The releases accepted, newest first. */
    readonly releases: readonly ProtocolCodec[];
    /** Every codec a client may negotiate: the releases, and any preview this build has. */
    readonly accepted: readonly ProtocolCodec[];
    /** The release whose content the world holds. */
    readonly content: ProtocolCodec;
    /** The window the settings asked for, when the build has fewer releases than that. */
    readonly clampedFrom?: number;
    /**
     * The codec for a client's announced protocol, or undefined when the policy refuses it.
     * @param protocolVersion - The number the client sent in `RequestNetworkSettings`.
     */
    codecFor(protocolVersion: number): ProtocolCodec | undefined;
}

/**
 * Resolves protocol settings against a build's codecs.
 *
 * A window below 1 accepts the newest release only, and a window wider than the releases the
 * build has is clamped to them, so a newer build that dropped an old codec still starts.
 * @param settings - What `config.json` says.
 * @param codecs - The build's codecs, newest first. Defaults to the server's.
 * @returns The policy the network and the content build read.
 */
export const resolveProtocolPolicy = (
    settings: ProtocolSettings = DEFAULT_PROTOCOL_SETTINGS,
    codecs: readonly ProtocolCodec[] = registeredCodecs
): ProtocolPolicy => {
    const releases = codecs.filter((codec) => codec.preview !== true);
    const previews = codecs.filter((codec) => codec.preview === true);
    const window = Math.max(1, Math.floor(settings.window));
    const accepted = releases.slice(0, window);
    const byProtocol = new Map([...previews, ...accepted].map((codec) => [codec.protocolVersion, codec]));

    return {
        releases: accepted,
        accepted: [...byProtocol.values()].sort((a, b) => b.protocolVersion - a.protocolVersion),
        content: settings.content === 'oldest' ? accepted.at(-1)! : accepted[0]!,
        ...(window > releases.length ? { clampedFrom: window } : {}),
        codecFor: (protocolVersion) => byProtocol.get(protocolVersion)
    };
};
