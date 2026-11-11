import { cString } from './NativeNetwork';
import type { NativeNetwork } from './NativeNetwork';

/** The bytes the native side puts before each datagram in a ring: family, reserved, port, address. */
export const DATAGRAM_HEADER_BYTES = 20;

/** The int32 control slots before a ring's bytes; `SharedByteRing` in `@jsprismarine/raknet` has the same. */
export const RING_CONTROL_BYTES = 32;

/** The counters a shared port keeps, in the order `jsp_mux_stats` writes them. */
export interface SharedPortStats {
    /** Datagrams the classifier gave RakNet. */
    readonly raknet: number;
    /** Datagrams it let through to libjuice's address lookup. */
    readonly passed: number;
    /** Unsure datagrams no peer claimed, given RakNet. */
    readonly unhandledToRakNet: number;
    /** STUN or DTLS datagrams no peer claimed, dropped. */
    readonly unhandledDropped: number;
    /** RakNet datagrams dropped because the inbound ring was full. */
    readonly ringFull: number;
    /** RakNet datagrams of an address family with no rings attached. */
    readonly noRing: number;
    /** Wakes sent to RakNet's consumer. */
    readonly wakes: number;
    /** RakNet datagrams sent from the mux socket. */
    readonly sent: number;
    readonly sendFailed: number;
}

/** How many counters `jsp_mux_stats` writes (`JSP_MUX_STAT_COUNT`). */
const STAT_COUNT = 9;

/** The rings one address family's RakNet datagrams cross in, and where to wake the native side. */
export interface RakNetRings {
    /** Written by the native side, read by RakNet. */
    readonly inbound: SharedArrayBuffer;
    /** Written by RakNet, read by the native side. */
    readonly outbound: SharedArrayBuffer;
    /** The loopback UDP port RakNet sends a byte to after writing a batch to the outbound ring. */
    readonly outboundWakePort: number;
}

/**
 * A UDP port libjuice owns and RakNet shares (ADR 0008).
 *
 * Opening it binds the mux socket, dual-stack unless a bind address is given, and keeps it open
 * with no peer connection on it. Every datagram is classified on libjuice's thread: RakNet's go
 * to the rings of their address family, and STUN and DTLS stay with libjuice. A peer connection
 * shares the port by being created with `enableIceUdpMux` and this port as its range.
 */
export class SharedPort {
    private readonly attached = new Map<number, RakNetRings>();

    private constructor(
        private readonly network: NativeNetwork,
        private readonly handle: number,
        public readonly port: number
    ) {}

    /**
     * Binds the port.
     * @param network - The loaded library.
     * @param port - The UDP port.
     * @param bindAddress - The address to bind; every interface, dual-stack, when absent.
     * @returns The open port.
     * @throws {Error} When the port cannot be bound.
     */
    public static open(network: NativeNetwork, port: number, bindAddress = ''): SharedPort {
        const handle = network.symbols.jsp_mux_open(cString(bindAddress), port);
        if (handle < 0) {
            throw new Error(`UDP port ${port} cannot be bound for RakNet and NetherNet together (error ${handle})`);
        }
        return new SharedPort(network, handle, port);
    }

    /**
     * Gives one address family's RakNet datagrams to a pair of new rings.
     * @param family - 4 or 6.
     * @param capacity - Each ring's byte capacity, a power of two.
     * @param wakePort - The loopback UDP port the consumer listens on for inbound wakes.
     * @returns The rings, to hand to RakNet.
     */
    public attach(family: 4 | 6, capacity: number, wakePort: number): RakNetRings {
        const inbound = new SharedArrayBuffer(RING_CONTROL_BYTES + capacity);
        const outbound = new SharedArrayBuffer(RING_CONTROL_BYTES + capacity);
        const result = this.network.symbols.jsp_mux_attach(
            this.handle,
            family,
            this.network.pointerOf(inbound),
            inbound.byteLength,
            this.network.pointerOf(outbound),
            outbound.byteLength,
            wakePort
        );
        if (result < 0) throw new Error(`Attaching RakNet's IPv${family} rings failed (error ${result})`);
        // Held here as well, so the memory outlives every native write to it.
        const rings = { inbound, outbound, outboundWakePort: result };
        this.attached.set(family, rings);
        return rings;
    }

    /**
     * Stops giving a family's datagrams to its rings.
     * @param family - 4 or 6.
     */
    public detach(family: 4 | 6): void {
        this.network.symbols.jsp_mux_detach(this.handle, family);
        this.attached.delete(family);
    }

    /** The port's counters. */
    public stats(): SharedPortStats {
        const out = Buffer.alloc(STAT_COUNT * 4);
        this.network.symbols.jsp_mux_stats(this.handle, out, STAT_COUNT);
        const at = (index: number): number => out.readInt32LE(index * 4);
        return {
            raknet: at(0),
            passed: at(1),
            unhandledToRakNet: at(2),
            unhandledDropped: at(3),
            ringFull: at(4),
            noRing: at(5),
            wakes: at(6),
            sent: at(7),
            sendFailed: at(8)
        };
    }

    /** Stops classifying; the socket closes once no peer connection is on it. */
    public close(): void {
        this.network.symbols.jsp_mux_close(this.handle);
        this.attached.clear();
    }
}
