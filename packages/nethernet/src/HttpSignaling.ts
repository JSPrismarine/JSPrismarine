import { lookup } from 'node:dns/promises';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { familyOf, isPublicAddress, unmapped } from './addresses';

import { SignalStructure, SignalType } from './protocol/Signal';
import { randomUint64 } from './randomUint64';
import { withoutIdentity } from './sdp';
import { describeCandidates, tracePeerConnection } from './tracePeerConnection';
import { hasPublicCandidate } from './udpPorts';
import type { DialedAddress } from './udpPorts';
import type { DriverPeer } from './WebRtcDriver';

/** The largest SDP offer accepted. A real offer with every candidate is a few kilobytes. */
const MAX_OFFER_BYTES = 64 * 1024;

/** How long an offer may wait for its answer; go-nethernet's handler allows the same. */
const DEFAULT_ANSWER_TIMEOUT_MS = 15_000;

/**
 * The longest network ID accepted. Today's is an unsigned 64-bit integer in decimal, 20 digits
 * at most, and Mojang's guide says the format may change, to a GUID for one.
 */
const MAX_NETWORK_ID_LENGTH = 128;

/** How long a hostname a client dialed may take to resolve before its answer goes out without it. */
const RESOLVE_TIMEOUT_MS = 1_000;

/** How long a resolved hostname is remembered, and how many are: players dial the same few names. */
const RESOLVED_TTL_MS = 60_000;
const RESOLVED_LIMIT = 64;

/** A hostname as DNS allows one, which keeps anything else in a `Host` header from being looked up. */
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.?$/i;

/** The part of {@link NetherNetServer} that turns an offer into an answer. */
export interface NetherNetOfferAnswerer {
    /** Every peer by connection ID, which a new offer's ID must not collide with. */
    readonly connections: ReadonlyMap<bigint, { close(reason?: string): void; readonly peer?: DriverPeer }>;
    /** Negotiates a peer for the offer, answering through `respond`. */
    handleOffer(signal: SignalStructure, respond: (signal: SignalStructure) => void): Promise<void>;
}

/**
 * Where the signaling server reports what it does. `@jsprismarine/logger`'s `Logger` fits. Each
 * join's candidates and progress go to `debug`, and a join that fails to `warn`.
 */
export interface SignalingLogger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(error: unknown): void;
}

/** What the signaling server needs besides the answerer. */
export interface HttpSignalingOptions {
    /** Turns an offer into an answer and keeps the peer it negotiates. */
    readonly answerer: NetherNetOfferAnswerer;
    /** The `GET /v1/join` body, read per request. */
    readonly status: () => string;
    /**
     * Adds the server's `a=identity` to an answer; the client refuses one without it. `dialed` is
     * where the client sent its offer, for `withDialedCandidates` to add to the answer first.
     */
    readonly sign: (answer: string, dialed?: DialedAddress) => string | Promise<string>;
    /**
     * Resolves a hostname a client dialed to its IP addresses; the system resolver when absent.
     * The name comes from the request's `Host` header, so anyone who can reach signaling picks it.
     */
    readonly resolve?: (hostname: string) => Promise<readonly string[]>;
    readonly logger: SignalingLogger;
    /** How long an offer may wait for its answer. */
    readonly answerTimeoutMs?: number;
}

/** How a negotiation ended. */
type Negotiation =
    | { readonly answer: string; readonly connectionId: bigint }
    | { readonly error: string }
    | { readonly timedOut: true };

/** Thrown while reading an offer, carrying the status the request is refused with. */
class RefusedRequest extends Error {
    public constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
    }
}

/**
 * NetherNet's HTTP signaling, which a client joining by address uses: it probes `GET /v1/join`
 * on the game port's TCP side, then posts its complete SDP offer to `POST /v1/join/{networkId}`
 * and reads the complete answer from the response. One request per attempt; trickle ICE is
 * off, so each side's candidates travel inside its description.
 *
 * The offer goes to the same {@link NetherNetServer} LAN signaling feeds, so a peer negotiated
 * here reaches the server through `NetherNetTransport` like any other. HTTP carries no
 * connection ID, so this picks one for each offer, unused by any live peer. The network ID in
 * the path is the client's and opaque: it names the client in the log and nothing reads it.
 */
export class HttpSignaling {
    private readonly server: http.Server;
    private readonly answerTimeoutMs: number;
    /** What each hostname clients dialed resolved to, and until when that holds. */
    private readonly resolved = new Map<string, { readonly addresses: readonly string[]; readonly until: number }>();

    public constructor(private readonly options: HttpSignalingOptions) {
        this.answerTimeoutMs = options.answerTimeoutMs ?? DEFAULT_ANSWER_TIMEOUT_MS;
        this.server = http.createServer(
            // A client sends one request per attempt, so a connection that lingers is not a client.
            { requestTimeout: 10_000, headersTimeout: 5_000, keepAliveTimeout: 0 },
            (request, response) => void this.route(request, response)
        );
    }

    /**
     * Listens on TCP.
     * @param port - The game port; NetherNet signals on its TCP side.
     * @param host - The address to bind.
     * @returns The bound port, which differs from `port` when that was 0.
     */
    public listen(port: number, host: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, host, () => {
                this.server.off('error', reject);
                const address: AddressInfo | string | null = this.server.address();
                resolve(typeof address === 'object' && address !== null ? address.port : port);
            });
        });
    }

    /** Stops listening and drops open requests. */
    public close(): void {
        this.server.close();
        this.server.closeAllConnections();
    }

    private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
        response.setHeader('Connection', 'close');
        const path = (request.url ?? '').split('?')[0];
        try {
            if (request.method === 'GET' && path === '/v1/join') {
                this.options.logger.debug(`NetherNet status asked for by ${remoteOf(request)}`);
                response.writeHead(200, { 'Content-Type': 'application/json' }).end(this.options.status());
                return;
            }
            const networkId = /^\/v1\/join\/([^/]*)$/.exec(path ?? '')?.[1];
            if (request.method === 'POST' && networkId !== undefined) {
                await this.join(networkId, request, response);
                return;
            }
            text(response, 404, 'Not Found');
        } catch (error: unknown) {
            if (error instanceof RefusedRequest) {
                text(response, error.status, error.message);
                return;
            }
            this.options.logger.error(error);
            if (!response.headersSent) text(response, 500, 'An error occurred while handling this request');
        }
    }

    private async join(networkIdText: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
        const { logger } = this.options;
        const networkId = parseNetworkId(networkIdText);
        const offer = await readOffer(request);
        const from = `${remoteOf(request)} (network ${networkId})`;
        logger.debug(
            `NetherNet join from ${from}, offering ${describeCandidates(offer).join(', ') || 'no candidates'}`
        );

        const started = Date.now();
        const result = await this.negotiate(offer);
        if ('answer' in result) {
            const answer = await this.options.sign(result.answer, await this.dialedBy(request));
            logger.debug(
                `NetherNet join from ${from} answered in ${Date.now() - started} ms as connection ${result.connectionId}, offering ${describeCandidates(answer).join(', ') || 'no candidates'}`
            );
            if (isPublicAddress(request.socket.remoteAddress ?? '') && !hasPublicCandidate(answer)) {
                logger.warn(
                    `NetherNet join from ${from} was offered no public address, so the player cannot connect from outside this network. Set server-public-ip to the address players reach this server at.`
                );
            }
            response.writeHead(200, { 'Content-Type': 'application/sdp' }).end(answer);
            return;
        }
        if ('error' in result) {
            logger.warn(`NetherNet join from ${from} failed with error ${result.error}`);
            text(response, 500, result.error);
            return;
        }
        logger.warn(`NetherNet join from ${from} timed out waiting for an answer`);
        text(response, 504, 'Timed out waiting for answer');
    }

    /**
     * Where the client sent its offer, from the request's `Host` header: the address the player
     * typed, with the port, which leads to this server through whatever NAT or port forwarding
     * sits in front of it. Undefined when the header names nothing usable.
     */
    private async dialedBy(request: IncomingMessage): Promise<DialedAddress | undefined> {
        const localPort = request.socket.localPort;
        if (localPort === undefined) return undefined;
        let url: URL;
        try {
            url = new URL(`http://${request.headers.host ?? ''}`);
        } catch {
            return undefined;
        }
        // A URL keeps an IPv6 host in its brackets.
        const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
        const addresses = familyOf(host) === undefined ? await this.addressesOf(host) : [host];
        if (addresses.length === 0) return undefined;
        // A `Host` without a port is the scheme's default, which signaling was not dialed on.
        return { addresses, port: url.port === '' ? localPort : Number(url.port), localPort };
    }

    /** The addresses a hostname resolves to, remembered for a while; none when it does not resolve in time. */
    private async addressesOf(hostname: string): Promise<readonly string[]> {
        if (!HOSTNAME.test(hostname)) return [];
        const name = hostname.toLowerCase();
        const known = this.resolved.get(name);
        if (known !== undefined && known.until > Date.now()) return known.addresses;
        const resolve =
            this.options.resolve ??
            (async (host: string) => (await lookup(host, { all: true })).map(({ address }) => address));
        let timer: NodeJS.Timeout | undefined;
        const addresses = await Promise.race([
            resolve(name).catch((): readonly string[] => []),
            new Promise<readonly string[]>((done) => {
                timer = setTimeout(() => done([]), RESOLVE_TIMEOUT_MS);
            })
        ]);
        clearTimeout(timer);
        // The oldest entry makes room: a Map keeps its keys in the order they were set.
        this.resolved.delete(name);
        if (this.resolved.size >= RESOLVED_LIMIT) this.resolved.delete(this.resolved.keys().next().value ?? name);
        this.resolved.set(name, { addresses: addresses.map(unmapped), until: Date.now() + RESOLVED_TTL_MS });
        return this.resolved.get(name)?.addresses ?? [];
    }

    /** Hands the offer to the answerer under a fresh connection ID and waits for its answer. */
    private negotiate(offer: string): Promise<Negotiation> {
        const { answerer } = this.options;
        let connectionId = randomUint64();
        while (answerer.connections.has(connectionId)) connectionId = randomUint64();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                answerer.connections.get(connectionId)?.close('Timed out waiting for answer');
                resolve({ timedOut: true });
            }, this.answerTimeoutMs);
            const settle = (result: Negotiation) => {
                clearTimeout(timeout);
                resolve(result);
            };

            // The answer already lists every candidate, so later CANDIDATEADD signals are dropped.
            const respond = (signal: SignalStructure) => {
                if (signal.type === SignalType.ConnectResponse) {
                    // From here the join is WebRTC's: report each state change until it settles.
                    const peer = answerer.connections.get(connectionId)?.peer;
                    if (peer !== undefined) {
                        tracePeerConnection(peer, (line, failed) =>
                            this.options.logger[failed ? 'warn' : 'debug'](
                                `NetherNet connection ${connectionId}: ${line}`
                            )
                        );
                    }
                    settle({ answer: signal.data, connectionId });
                } else if (signal.type === SignalType.ConnectError) settle({ error: signal.data });
            };
            const request = new SignalStructure(SignalType.ConnectRequest, connectionId, withoutIdentity(offer));
            answerer.handleOffer(request, respond).catch((error: unknown) => {
                this.options.logger.error(error);
                settle({ error: 'An error occurred while answering' });
            });
        });
    }
}

/** Who sent the request, as `address:port`. */
const remoteOf = (request: IncomingMessage): string => `${request.socket.remoteAddress}:${request.socket.remotePort}`;

/** Ends the response with a plain-text body, as Bedrock Dedicated Server does for its errors. */
const text = (response: ServerResponse, status: number, body: string): void => {
    response.writeHead(status, { 'Content-Type': 'text/plain' }).end(body);
};

/**
 * The client's network ID from the path, for the log. Mojang's guide makes it an opaque string
 * whose format may change, so any text is taken; one that is not plain printable ASCII is quoted
 * and escaped, so it cannot forge a log line.
 * @throws {RefusedRequest} When it is empty or longer than an ID can be.
 */
const parseNetworkId = (segment: string): string => {
    let text = segment;
    try {
        text = decodeURIComponent(segment);
    } catch {
        // Not percent-encoding; the segment is the ID as it stands.
    }
    if (text === '' || text.length > MAX_NETWORK_ID_LENGTH) {
        throw new RefusedRequest(400, 'Expected /v1/join/{networkId}');
    }
    return /^[\x21-\x7e]+$/.test(text) ? text : JSON.stringify(text);
};

/**
 * The request body as text, refused when empty or larger than an offer can be.
 * @throws {RefusedRequest} When the body is empty or too large.
 */
const readOffer = async (request: IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += buffer.byteLength;
        if (size > MAX_OFFER_BYTES) throw new RefusedRequest(413, 'SDP offer is too large');
        chunks.push(buffer);
    }
    const offer = Buffer.concat(chunks).toString('utf-8');
    if (offer.trim() === '') throw new RefusedRequest(400, 'Missing SDP offer in request body');
    return offer;
};
