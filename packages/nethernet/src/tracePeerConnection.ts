import type { DriverPeer } from './WebRtcDriver';

/** The candidates a description lists, as `address:port type`, for a log line. */
export const describeCandidates = (description: string): string[] =>
    [...description.matchAll(/^a=candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+) typ (\S+)/gim)].map(
        ([, protocol, address, port, type]) =>
            `${address}:${port} ${type}${protocol?.toLowerCase() === 'udp' ? '' : ` ${protocol}`}`
    );

/**
 * Reports a peer's connection states as they change, and the addresses ICE settles on: where a
 * join that never finishes stopped. A peer that never connects usually means the server's UDP
 * ports are not reachable from the client, as behind a firewall that opens only the game port.
 * @param peer - The peer.
 * @param log - Where each change goes, as one line.
 */
export const tracePeerConnection = (peer: DriverPeer, log: (line: string) => void): void => {
    peer.onStateChange((state) => {
        log(`connection ${state}`);
        if (state !== 'connected') return;
        const local = peer.localAddress();
        const remote = peer.remoteAddress();
        log(
            `ICE pair ${local === undefined ? '?' : `${local.address}:${local.port}`} <-> ${remote === undefined ? '?' : `${remote.address}:${remote.port}`}`
        );
    });
};
