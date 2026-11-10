import { decodeJoinStatus } from './NetherNetStatus';
import type { NetherNetStatus } from './NetherNetStatus';

/** Where a NetherNet server signals: the TCP side of its game port. */
export interface SignalingAddress {
    readonly host: string;
    readonly port: number;
}

/** A failed `POST /v1/join/{networkId}`, with what the server answered. */
export class JoinRefusedError extends Error {
    public constructor(
        public readonly status: number,
        public readonly body: string
    ) {
        super(`The server refused the offer with HTTP ${status}${body === '' ? '' : `: ${body}`}`);
    }
}

/** The signaling origin, with an IPv6 host in brackets as a URL needs. */
const origin = ({ host, port }: SignalingAddress): string =>
    `http://${host.includes(':') ? `[${host}]` : host}:${port}`;

/** What `GET /v1/join` said about a server that speaks NetherNet. */
export interface JoinProbe {
    /**
     * The server's status, when it sent one. Bedrock Dedicated Server 1.26.51 answers with an empty
     * body when LAN visibility is off, and go-nethernet does when it has no status to give.
     */
    readonly status?: NetherNetStatus;
}

/**
 * Asks whether the server speaks NetherNet, as a client does before it joins by address: any 2xx
 * from `GET /v1/join` means yes, whatever the body says.
 * @param address - The server's host and game port.
 * @param signal - Aborts the request.
 * @returns What the server said, or undefined when it does not speak NetherNet there.
 * @throws {Error} When a 2xx body is present but is not a join status.
 */
export const probeJoin = async (address: SignalingAddress, signal?: AbortSignal): Promise<JoinProbe | undefined> => {
    const response = await fetch(`${origin(address)}/v1/join`, { signal });
    if (!response.ok) return undefined;
    const body = await response.text();
    return body.trim() === '' ? {} : { status: decodeJoinStatus(body) };
};

/**
 * Trades a complete SDP offer for the server's complete answer, the one request a client sends
 * per attempt.
 * @param address - The server's host and game port.
 * @param networkId - The client's own network ID.
 * @param offer - The offer, with every candidate and the client's `a=identity`.
 * @param signal - Aborts the request.
 * @returns The answer.
 * @throws {JoinRefusedError} When the server answers anything but 2xx.
 */
export const exchangeOffer = async (
    address: SignalingAddress,
    networkId: bigint,
    offer: string,
    signal?: AbortSignal
): Promise<string> => {
    const response = await fetch(`${origin(address)}/v1/join/${networkId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer,
        signal
    });
    const body = await response.text();
    if (!response.ok) throw new JoinRefusedError(response.status, body);
    return body;
};
