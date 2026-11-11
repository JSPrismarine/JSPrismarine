import type { PortRange } from './udpPorts';

/** One port of a range and how many peers it serves now. */
export interface PortLoad {
    readonly port: number;
    readonly peers: number;
}

/**
 * Picks the port a new peer goes on, from the ports of the range and the peers on each. Ports
 * are reused once every one serves a peer, so a strategy always has a port to give.
 */
export interface PortSelectionStrategy {
    /**
     * @param ports - Every port of the range, lowest first.
     * @returns One of the ports.
     */
    select(ports: readonly PortLoad[]): number;
}

/** The port with the fewest peers, the lowest on a tie. */
export const fewestPeers: PortSelectionStrategy = {
    select: (ports) => {
        let best = ports[0]!;
        for (const load of ports) if (load.peers < best.peers) best = load;
        return best.port;
    }
};

/**
 * Hands each new peer a port of a range through a {@link PortSelectionStrategy}, and takes it
 * back when the peer leaves. A single port is a range of one, which every peer shares.
 */
export class PortAllocator {
    private readonly peers = new Map<number, number>();

    /**
     * @param range - The local ports.
     * @param strategy - How a port is picked; the fewest peers by default.
     */
    public constructor(
        public readonly range: PortRange,
        private readonly strategy: PortSelectionStrategy = fewestPeers
    ) {
        for (let port = range.start; port <= range.end; port++) this.peers.set(port, 0);
    }

    /** Takes a port for a new peer. */
    public acquire(): number {
        const port = this.strategy.select(this.loads());
        const peers = this.peers.get(port);
        if (peers === undefined)
            throw new RangeError(`The strategy picked ${port}, outside ${this.range.start}-${this.range.end}`);
        this.peers.set(port, peers + 1);
        return port;
    }

    /**
     * Gives a peer's port back.
     * @param port - The port {@link PortAllocator.acquire} gave it.
     */
    public release(port: number): void {
        const peers = this.peers.get(port);
        if (peers !== undefined && peers > 0) this.peers.set(port, peers - 1);
    }

    /** Every port of the range and its peers, lowest first. */
    public loads(): PortLoad[] {
        return [...this.peers].map(([port, peers]) => ({ port, peers }));
    }
}
