/**
 * The WebRTC stack NetherNet runs on, as the little this package needs from one. The native
 * networking library is the driver today (`nativeDriver.ts`); another library implements the
 * same interface, and nothing else in this package names the one underneath.
 */

/** A peer connection's state, as the W3C `connectionState` names it. */
export type PeerState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/** Where a peer binds and which local ports it may use. */
export interface PeerConfig {
    /** STUN and TURN server URLs. */
    readonly iceServers?: readonly string[];
    /** The local address to bind; every interface when absent. */
    readonly bindAddress?: string;
    /** The local UDP port range; 0 or absent lets the system choose. */
    readonly portRangeBegin?: number;
    readonly portRangeEnd?: number;
    /** Serves every peer on a port from one socket. */
    readonly enableIceUdpMux?: boolean;
}

/** A UDP address. */
export interface PeerAddress {
    readonly address: string;
    readonly port: number;
}

/** A data channel on a {@link DriverPeer}. */
export interface DriverChannel {
    readonly label: string;
    readonly readyState: 'connecting' | 'open' | 'closing' | 'closed';
    /** Bytes the stack has queued and not yet handed on. */
    readonly bufferedAmount: number;
    /** Sends one message; false when the channel cannot take it. */
    send(data: Uint8Array): boolean;
    close(): void;
    onOpen(listener: () => void): void;
    onClose(listener: () => void): void;
    onMessage(listener: (data: Buffer) => void): void;
}

/** One WebRTC peer connection. */
export interface DriverPeer {
    readonly state: PeerState;
    /** Applies the remote description. A remote offer makes the stack answer by itself. */
    setRemoteDescription(type: 'offer' | 'answer', sdp: string): void;
    /** Adds a remote candidate line, with or without `a=`. */
    addRemoteCandidate(candidate: string, sdpMid?: string): void;
    /** Opens a data channel; the first one on a new connection makes the stack offer. */
    createDataChannel(label: string, options?: { unordered?: boolean; maxRetransmits?: number }): DriverChannel;
    /** The local description with every candidate, once gathering completes. */
    localDescription(): Promise<string>;
    onDataChannel(listener: (channel: DriverChannel) => void): void;
    onStateChange(listener: (state: PeerState) => void): void;
    /** The remote address of the candidate pair ICE selected, once connected. */
    remoteAddress(): PeerAddress | undefined;
    /** The local address of the selected pair, once connected. */
    localAddress(): PeerAddress | undefined;
    close(): void;
}

/** Builds peer connections. */
export interface WebRtcDriver {
    createPeer(config?: PeerConfig): DriverPeer;
}

/**
 * The address and port in an ICE candidate line, which reads
 * `candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> …`.
 * @param candidate - The candidate line, with or without the `a=` SDP prefix.
 * @returns The address, or undefined for a line that does not have one where the format puts it.
 */
export const candidateAddress = (candidate: string): PeerAddress | undefined => {
    const fields = candidate.replace(/^a=/, '').split(' ');
    const address = fields[4];
    const port = Number(fields[5]);
    if (!address || !Number.isInteger(port) || port < 1 || port > 65_535) return undefined;
    return { address, port };
};
