import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SignalStructure, SignalType } from 'nethernet';
import { withoutIdentity } from './sdp';

/** The largest SDP offer accepted. A real offer with every candidate is a few kilobytes. */
const MAX_OFFER_BYTES = 64 * 1024;

/** How long an offer may wait for its answer; go-nethernet's handler allows the same. */
const DEFAULT_ANSWER_TIMEOUT_MS = 15_000;

/** The largest NetherNet network ID, an unsigned 64-bit integer. */
const MAX_NETWORK_ID = (1n << 64n) - 1n;

/** The part of `nethernet`'s `Server` that turns an offer into an answer. */
export interface NetherNetOfferAnswerer {
    /** Every peer by connection ID, which a new offer's ID must not collide with. */
    readonly connections: ReadonlyMap<bigint, { close(reason?: string): void }>;
    /** Negotiates a peer for the offer, answering through `respond`. */
    handleOffer(signal: SignalStructure, respond: (signal: SignalStructure) => void): Promise<void>;
}

/** Where the signaling server reports what went wrong. `@jsprismarine/logger`'s `Logger` fits. */
export interface SignalingLogger {
    debug(message: string): void;
    error(error: unknown): void;
}

/** What the signaling server needs besides the answerer. */
export interface HttpSignalingOptions {
    /** Turns an offer into an answer and keeps the peer it negotiates. */
    readonly answerer: NetherNetOfferAnswerer;
    /** The `GET /v1/join` body, read per request. */
    readonly status: () => string;
    /** Adds the server's `a=identity` to an answer; the client refuses one without it. */
    readonly sign: (answer: string) => string;
    readonly logger: SignalingLogger;
    /** How long an offer may wait for its answer. */
    readonly answerTimeoutMs?: number;
}

/** How a negotiation ended. */
type Negotiation = { readonly answer: string } | { readonly error: string } | { readonly timedOut: true };

/** Thrown while reading an offer, carrying the status the request is refused with. */
class RefusedRequest extends Error {
    public constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
    }
}

/** A random unsigned 64-bit integer. */
const randomUint64 = (): bigint => randomBytes(8).readBigUInt64BE();

/**
 * NetherNet's HTTP signaling, which a client joining by address uses: it probes `GET /v1/join`
 * on the game port's TCP side, then posts its complete SDP offer to `POST /v1/join/{networkId}`
 * and reads the complete answer from the response. One request per attempt; trickle ICE is
 * off, so each side's candidates travel inside its description.
 *
 * The offer goes to the same `nethernet` `Server` LAN signaling feeds, so a peer negotiated
 * here reaches the server through `NetherNetTransport` like any other. HTTP carries no
 * connection ID, so this picks one for each offer, unused by any live peer.
 */
export class HttpSignaling {
    private readonly server: http.Server;
    private readonly answerTimeoutMs: number;

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
        const networkId = parseNetworkId(networkIdText);
        const offer = await readOffer(request);

        const result = await this.negotiate(networkId, offer);
        if ('answer' in result) {
            response.writeHead(200, { 'Content-Type': 'application/sdp' }).end(this.options.sign(result.answer));
            return;
        }
        if ('error' in result) {
            this.options.logger.debug(`NetherNet offer from ${networkId} failed with error ${result.error}`);
            text(response, 500, result.error);
            return;
        }
        this.options.logger.debug(`NetherNet offer from ${networkId} timed out waiting for an answer`);
        text(response, 504, 'Timed out waiting for answer');
    }

    /** Hands the offer to the answerer under a fresh connection ID and waits for its answer. */
    private negotiate(networkId: bigint, offer: string): Promise<Negotiation> {
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
                if (signal.type === SignalType.ConnectResponse) settle({ answer: signal.data });
                else if (signal.type === SignalType.ConnectError) settle({ error: signal.data });
            };
            const request = new SignalStructure(
                SignalType.ConnectRequest,
                connectionId,
                withoutIdentity(offer),
                networkId
            );
            answerer.handleOffer(request, respond).catch((error: unknown) => {
                this.options.logger.error(error);
                settle({ error: 'An error occurred while answering' });
            });
        });
    }
}

/** Ends the response with a plain-text body, as Bedrock Dedicated Server does for its errors. */
const text = (response: ServerResponse, status: number, body: string): void => {
    response.writeHead(status, { 'Content-Type': 'text/plain' }).end(body);
};

/**
 * The client's network ID from the path: an unsigned 64-bit integer in decimal.
 * @throws {RefusedRequest} When it is anything else.
 */
const parseNetworkId = (text: string): bigint => {
    if (!/^\d{1,20}$/.test(text) || BigInt(text) > MAX_NETWORK_ID) {
        throw new RefusedRequest(400, 'Expected /v1/join/{networkId}');
    }
    return BigInt(text);
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
