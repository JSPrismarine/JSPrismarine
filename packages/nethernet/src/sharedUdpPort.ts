import type { RemoteInfo, Socket } from 'node:dgram';
import { createSocket } from 'node:dgram';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';

import { isRecord } from './isRecord';

/** A UDP address as werift passes it: host, then port. */
type Address = readonly [host: string, port: number];

type SocketType = 'udp4' | 'udp6';

/** The options werift's `UdpTransport.init` reads. */
interface UdpTransportOptions {
    readonly port?: number;
    readonly portRange?: readonly number[];
    readonly interfaceAddresses?: Partial<Record<SocketType, string>>;
}

/** Werift's `Event`, as far as a transport's `onError` needs it. */
interface WeriftEvent {
    readonly execute: (...args: unknown[]) => void;
    readonly complete: () => void;
}

/** The werift module `nethernet` runs, as far as this needs it. */
interface Werift {
    readonly UdpTransport: { init: (type: SocketType, options?: UdpTransportOptions) => Promise<unknown> };
    readonly Event: new () => WeriftEvent;
}

const isWerift = (value: unknown): value is Werift =>
    isRecord(value) &&
    typeof value.Event === 'function' &&
    typeof value.UdpTransport === 'function' &&
    typeof Reflect.get(value.UdpTransport, 'init') === 'function';

/** STUN's magic cookie (RFC 8489 section 5), which tells a STUN message from DTLS or TURN channel data. */
const MAGIC_COOKIE = 0x21_12_a4_42;
const HEADER_LENGTH = 20;
const USERNAME = 0x00_06;
/** How many unanswered STUN requests a socket remembers the sender of. */
const MAX_TRANSACTIONS = 4096;

type StunClass = 'request' | 'indication' | 'response';

/** The class and transaction ID of a STUN message, or undefined for anything else. */
const stunHeaderOf = (data: Buffer): { readonly kind: StunClass; readonly id: string } | undefined => {
    if (data.length < HEADER_LENGTH || (data[0] ?? 0xff) > 0x03 || data.readUInt32BE(4) !== MAGIC_COOKIE) {
        return undefined;
    }
    const bits = data.readUInt16BE(0) & 0x01_10;
    const kind = bits === 0 ? 'request' : bits === 0x00_10 ? 'indication' : 'response';
    return { kind, id: data.toString('hex', 8, HEADER_LENGTH) };
};

/** The USERNAME attribute of a STUN message: `receiver:sender` ICE username fragments. */
const usernameOf = (data: Buffer): string | undefined => {
    const end = Math.min(data.length, HEADER_LENGTH + data.readUInt16BE(2));
    for (let offset = HEADER_LENGTH; offset + 4 <= end;) {
        const type = data.readUInt16BE(offset);
        const length = data.readUInt16BE(offset + 2);
        if (type === USERNAME) return data.toString('utf8', offset + 4, Math.min(end, offset + 4 + length));
        offset += 4 + Math.ceil(length / 4) * 4;
    }
    return undefined;
};

const keyOf = ([host, port]: Address): string => `${host}|${port}`;

/** A peer's werift ICE agent, which this reads to learn which socket user a check is for. */
const iceAgentsOf = (peer: object): { readonly ufrag: unknown; readonly protocols: unknown }[] => {
    const transports: unknown = Reflect.get(peer, 'iceTransports');
    if (!Array.isArray(transports)) return [];
    return transports.flatMap((transport: unknown) => {
        const connection: unknown = isRecord(transport) ? transport.connection : undefined;
        if (!isRecord(connection)) return [];
        return [{ ufrag: connection.localUsername, protocols: Reflect.get(connection, 'protocols') }];
    });
};

/**
 * One werift STUN or TURN protocol's view of a shared socket. It stands in for the `UdpTransport`
 * werift would bind for that protocol alone, with the members werift reads.
 */
class SharedPortTransport {
    public readonly type = 'udp';
    public closed = false;
    /** Werift replaces this with the handler for the protocol that owns the transport. */
    public onData: (data: Buffer, from: Address) => void = () => {};
    public readonly onError: WeriftEvent;

    public constructor(
        private readonly shared: SharedUdpPort,
        Event: Werift['Event']
    ) {
        this.onError = new Event();
    }

    public get address(): { address: string; port: number; family: string } {
        return this.shared.socket.address();
    }

    public get addressFamily(): 4 | 6 {
        return this.shared.type === 'udp6' ? 6 : 4;
    }

    public get host(): string {
        return this.address.address;
    }

    public get port(): number {
        return this.address.port;
    }

    public readonly send = async (data: Buffer, to?: Address): Promise<void> => {
        const target = to ?? this.shared.lastSenderOf(this);
        if (target === undefined || this.closed) return;
        this.shared.sent(this, data, target);
        const [host, port] = target;
        if (isIP(host) !== 0) {
            this.shared.socket.send(data, port, host);
            return;
        }
        // A hostname, such as a TURN server's: the callback reports a failed lookup.
        await new Promise<void>((resolve, reject) =>
            this.shared.socket.send(data, port, host, (error) => (error ? reject(error) : resolve()))
        );
    };

    public readonly close = async (): Promise<void> => {
        if (this.closed) return;
        this.closed = true;
        try {
            this.onError.complete();
        } finally {
            await this.shared.detach(this);
        }
    };
}

/**
 * A UDP socket every NetherNet peer of a server shares, the way Bedrock Dedicated Server serves
 * all players on one `server-udp-ports` port. Datagrams are routed to the peer they are for: a
 * connectivity check by the ICE username fragment it is addressed to, a STUN response by the
 * request it answers, and everything else by the address it came from.
 */
class SharedUdpPort {
    private readonly transports = new Set<SharedPortTransport>();
    private readonly byAddress = new Map<string, SharedPortTransport>();
    private readonly lastSender = new Map<SharedPortTransport, Address>();
    private readonly byTransaction = new Map<string, SharedPortTransport>();

    /** Set once the last transport left; the socket is closing and takes no new ones. */
    public closing: Promise<void> | undefined;

    private constructor(
        public readonly type: SocketType,
        public readonly socket: Socket,
        private readonly peers: Set<WeakRef<object>>
    ) {
        socket.on('message', (data, info) => this.route(data, info));
        // A late ICMP error, such as port unreachable: the socket stays usable.
        socket.on('error', (error) => {
            for (const transport of this.transports) transport.onError.execute(error);
        });
    }

    /**
     * Binds the socket.
     * @throws {Error} When the port is taken.
     */
    public static async open(
        type: SocketType,
        port: number,
        address: string | undefined,
        peers: Set<WeakRef<object>>
    ): Promise<SharedUdpPort> {
        // Without ipv6Only an IPv6 socket on the port would also take it for IPv4.
        const socket = createSocket({ type, ipv6Only: type === 'udp6' });
        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject);
            socket.bind({ port, address }, () => {
                socket.off('error', reject);
                resolve();
            });
        }).catch((error: unknown) => {
            socket.close();
            throw error;
        });
        return new SharedUdpPort(type, socket, peers);
    }

    public attach(Event: Werift['Event']): SharedPortTransport {
        const transport = new SharedPortTransport(this, Event);
        this.transports.add(transport);
        return transport;
    }

    /** Forgets a closed transport, and closes the socket when it was the last one. */
    public async detach(transport: SharedPortTransport): Promise<void> {
        this.transports.delete(transport);
        this.lastSender.delete(transport);
        for (const [key, owner] of this.byAddress) if (owner === transport) this.byAddress.delete(key);
        for (const [id, owner] of this.byTransaction) if (owner === transport) this.byTransaction.delete(id);
        if (this.transports.size > 0) return;
        this.closing ??= new Promise<void>((resolve) => this.socket.close(() => resolve()));
        await this.closing;
    }

    public lastSenderOf(transport: SharedPortTransport): Address | undefined {
        return this.lastSender.get(transport);
    }

    /** Notes where a transport sends, so answers from there reach it. */
    public sent(transport: SharedPortTransport, data: Buffer, to: Address): void {
        const key = keyOf(to);
        if (!this.byAddress.has(key)) this.byAddress.set(key, transport);
        const header = stunHeaderOf(data);
        if (header?.kind !== 'request') return;
        this.byTransaction.set(header.id, transport);
        if (this.byTransaction.size > MAX_TRANSACTIONS) {
            const oldest = this.byTransaction.keys().next();
            if (oldest.done !== true) this.byTransaction.delete(oldest.value);
        }
    }

    private route(data: Buffer, info: RemoteInfo): void {
        // A link-local IPv6 sender carries its interface, as in fe80::1%eth0; werift drops it.
        const from: Address = [info.address.split('%')[0] ?? info.address, info.port];
        const key = keyOf(from);
        const header = stunHeaderOf(data);
        let target: SharedPortTransport | undefined;
        if (header?.kind === 'response') {
            target = this.byTransaction.get(header.id);
            this.byTransaction.delete(header.id);
        } else if (header?.kind === 'request') {
            const ufrag = usernameOf(data)?.split(':')[0];
            target = ufrag === undefined ? undefined : this.transportFor(ufrag);
            if (target !== undefined) this.byAddress.set(key, target);
        }
        target ??= this.byAddress.get(key);
        if (target === undefined || target.closed) return;
        this.lastSender.set(target, from);
        target.onData(data, from);
    }

    /** The transport of the peer whose local ICE username fragment is `ufrag`. */
    private transportFor(ufrag: string): SharedPortTransport | undefined {
        for (const reference of this.peers) {
            const peer = reference.deref();
            if (peer === undefined) {
                this.peers.delete(reference);
                continue;
            }
            for (const agent of iceAgentsOf(peer)) {
                if (agent.ufrag !== ufrag || !Array.isArray(agent.protocols)) continue;
                for (const protocol of agent.protocols) {
                    const transport: unknown = isRecord(protocol) ? protocol.transport : undefined;
                    if (transport instanceof SharedPortTransport && this.transports.has(transport)) return transport;
                }
            }
        }
        return undefined;
    }
}

const socketKeyOf = (type: SocketType, port: number, address: string | undefined): string =>
    `${type}|${address ?? '*'}|${port}`;

/**
 * The end of the `icePortRange` that marks a shared port: one past the highest UDP port, so no
 * real range ends there. Werift refuses a range whose two ends are equal.
 */
export const SHARED_PORT_RANGE_END = 65_536;

/** The sockets open now, and the ones still binding. */
const sockets = new Map<string, Promise<SharedUdpPort>>();

/** Each shared port, with the peers built to use it. */
const sharedPorts = new Map<number, Set<WeakRef<object>>>();

let installed = false;

/**
 * Makes werift's `UdpTransport.init` hand out views of one shared socket for every port
 * {@link sharePort} registered, instead of a socket per peer. Werift gives the transport no seam
 * of its own; any other `init` call goes to werift unchanged.
 * @throws {Error} When the werift `nethernet` runs is not in the shape this expects.
 */
const install = (): void => {
    if (installed) return;
    const fromNetherNet = createRequire(createRequire(import.meta.url).resolve('nethernet'));
    // The CommonJS werift nethernet loads, whose UdpTransport its ICE agents call.
    const werift: unknown = fromNetherNet('werift');
    if (!isWerift(werift)) throw new Error('The werift nethernet runs has no UdpTransport to share a port through');
    const { UdpTransport, Event } = werift;
    const own = UdpTransport.init;
    UdpTransport.init = async function init(type, options = {}) {
        const [start, end] = options.portRange ?? [];
        const peers = start === undefined ? undefined : sharedPorts.get(start);
        if (options.port !== undefined || end !== SHARED_PORT_RANGE_END || start === undefined || peers === undefined) {
            return Reflect.apply(own, this, [type, options]);
        }
        const address = options.interfaceAddresses?.[type];
        const key = socketKeyOf(type, start, address);
        for (;;) {
            let opening = sockets.get(key);
            if (opening === undefined) {
                opening = SharedUdpPort.open(type, start, address, peers);
                sockets.set(key, opening);
            }
            const shared = await opening.catch((error: unknown) => {
                if (sockets.get(key) === opening) sockets.delete(key);
                throw error;
            });
            if (shared.closing === undefined) return shared.attach(Event);
            // The last peer on it just left: bind again once the port is released.
            if (sockets.get(key) === opening) sockets.delete(key);
            await shared.closing;
        }
    };
    installed = true;
};

/**
 * Serves every peer connection `peers` will hold from one UDP socket on `port`, per address
 * family. Call it before any of those peers gathers candidates, and add each peer to `peers` as
 * it is built; a peer must be in the set before a client's connectivity check reaches it.
 * @param port - The port, which werift must be given as `icePortRange` `[port, SHARED_PORT_RANGE_END]`.
 * @returns The set to add the peers to. They are held weakly, so a closed peer can be collected.
 * @throws {Error} When the werift `nethernet` runs is not in the shape this expects.
 */
export const sharePort = (port: number): Set<WeakRef<object>> => {
    install();
    let peers = sharedPorts.get(port);
    if (peers === undefined) {
        peers = new Set();
        sharedPorts.set(port, peers);
    }
    return peers;
};
