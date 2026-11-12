import type { DriverPeer, IceState } from './WebRtcDriver';

/** The candidates a description lists, as `address:port type`, for a log line. */
export const describeCandidates = (description: string): string[] =>
    [...description.matchAll(/^a=candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+) typ (\S+)/gim)].map(
        ([, protocol, address, port, type]) =>
            `${address}:${port} ${type}${protocol?.toLowerCase() === 'udp' ? '' : ` ${protocol}`}`
    );

/** What an ICE state says about a peer that closed before it connected. */
const stalledAt = (ice: IceState): string => {
    if (ice === 'new' || ice === 'checking' || ice === 'failed') {
        return `ICE was ${ice}: no connectivity check passed, so the client reached no address in the answer`;
    }
    return `ICE was ${ice}: the client reached the server, and the handshake after it did not finish`;
};

/**
 * Reports a peer's connection states as they change, and the addresses ICE settles on: where a
 * join that never finishes stopped. A peer that ends before it connects is reported with how far
 * ICE got, which tells an answer the client could not reach from a handshake that stalled after
 * the two sides found each other.
 * @param peer - The peer.
 * @param log - Where each change goes, as one line.
 */
export const tracePeerConnection = (peer: DriverPeer, log: (line: string) => void): void => {
    // ICE reports `closed` when the peer is torn down, which says nothing about how far it got.
    let ice = peer.iceState;
    let connected = peer.state === 'connected';
    peer.onIceStateChange((state) => {
        if (state !== 'closed') ice = state;
    });
    peer.onStateChange((state) => {
        if (state === 'connected') connected = true;
        const ended = state === 'closed' || state === 'failed';
        log(ended && !connected ? `connection ${state} before it connected; ${stalledAt(ice)}` : `connection ${state}`);
        if (state !== 'connected') return;
        const local = peer.localAddress();
        const remote = peer.remoteAddress();
        log(
            `ICE pair ${local === undefined ? '?' : `${local.address}:${local.port}`} <-> ${remote === undefined ? '?' : `${remote.address}:${remote.port}`}`
        );
    });
};
