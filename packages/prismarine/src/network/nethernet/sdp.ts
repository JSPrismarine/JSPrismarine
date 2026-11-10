/** SDP separates lines with CRLF; a peer that sends bare LF is read the same way. */
const LINE_BREAK = /\r?\n/;

/** The lines of a session description, without a trailing empty line. */
const linesOf = (sdp: string): string[] =>
    sdp.split(LINE_BREAK).filter((line, index, lines) => line !== '' || index < lines.length - 1);

/** Joins lines back into SDP, CRLF-terminated as the format requires. */
const sdpOf = (lines: readonly string[]): string => `${lines.join('\r\n')}\r\n`;

/** One `a=fingerprint` attribute: the DTLS certificate hash the peer must present. */
export interface SdpFingerprint {
    /** The hash function, such as `sha-256`. */
    readonly algorithm: string;
    /** The hash, colon-separated hex, as the SDP spells it. */
    readonly digest: string;
}

/**
 * Every `a=fingerprint` in a description, in the order they appear.
 * @param sdp - The session description.
 */
export const sdpFingerprints = (sdp: string): SdpFingerprint[] =>
    linesOf(sdp).flatMap((line) => {
        const match = /^a=fingerprint:(\S+) (\S+)$/.exec(line);
        return match === null ? [] : [{ algorithm: match[1]!, digest: match[2]! }];
    });

/**
 * The description with every `a=identity` line removed. The identity is NetherNet's, checked
 * before the description reaches WebRTC, which does not know the attribute.
 * @param sdp - The session description.
 */
export const withoutIdentity = (sdp: string): string =>
    sdpOf(linesOf(sdp).filter((line) => !line.startsWith('a=identity:')));

/**
 * The description with one session-level attribute added: after every other session-level line
 * and before the first media section, which is where NetherNet expects `a=identity`.
 * @param sdp - The session description.
 * @param attribute - The attribute line, such as `a=identity:…`.
 */
export const withSessionAttribute = (sdp: string, attribute: string): string => {
    const lines = linesOf(sdp);
    const media = lines.findIndex((line) => line.startsWith('m='));
    const at = media === -1 ? lines.length : media;
    return sdpOf([...lines.slice(0, at), attribute, ...lines.slice(at)]);
};
