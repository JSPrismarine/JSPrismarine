import { isRecord } from './isRecord';

/** The candidates a description lists, as `address:port type`, for a log line. */
export const describeCandidates = (description: string): string[] =>
    [...description.matchAll(/^a=candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+) typ (\S+)/gim)].map(
        ([, protocol, address, port, type]) =>
            `${address}:${port} ${type}${protocol?.toLowerCase() === 'udp' ? '' : ` ${protocol}`}`
    );

/** A candidate as an SDP line; werift's own candidate strings leave out the `candidate:` prefix. */
const candidateLine = (candidate: unknown): string => {
    const text = String(candidate);
    return text.startsWith('candidate:') ? `a=${text}` : `a=candidate:${text}`;
};

/** Subscribes to one of werift's events, if the object has it. */
const subscribe = (owner: Record<string, unknown>, name: string, listener: (state: unknown) => void): void => {
    const event = owner[name];
    if (isRecord(event) && typeof event.subscribe === 'function') event.subscribe(listener);
};

/**
 * Reports a peer connection's ICE and connection states as they change, and the candidate pair
 * ICE settles on: where a join that never finishes stopped. A pair that never connects usually
 * means the server's UDP ports are not reachable from the client, as behind a firewall that opens
 * only the game port.
 *
 * Werift, `nethernet`'s default backend, exposes these as events; with another backend this
 * reports nothing.
 * @param rtcConnection - The peer connection `nethernet` built.
 * @param log - Where each change goes, as one line.
 */
export const tracePeerConnection = (rtcConnection: unknown, log: (line: string) => void): void => {
    if (!isRecord(rtcConnection)) return;
    subscribe(rtcConnection, 'iceConnectionStateChange', (state) => {
        log(`ICE ${String(state)}`);
        if (state !== 'connected' && state !== 'completed') return;
        const transports = rtcConnection.iceTransports;
        const ice: unknown = Array.isArray(transports) ? transports[0] : undefined;
        if (!isRecord(ice) || typeof ice.getSelectedCandidatePair !== 'function') return;
        const pair: unknown = ice.getSelectedCandidatePair();
        if (!isRecord(pair) || !isRecord(pair.local) || !isRecord(pair.remote)) return;
        const [local] = describeCandidates(candidateLine(pair.local.candidate));
        const [remote] = describeCandidates(candidateLine(pair.remote.candidate));
        log(`ICE pair ${local ?? '?'} <-> ${remote ?? '?'}`);
    });
    subscribe(rtcConnection, 'connectionStateChange', (state) => log(`connection ${String(state)}`));
};
