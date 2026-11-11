import { EventEmitter } from 'node:events';

import {
    exchangeOffer,
    loadNativeDriver,
    NetherNetClient,
    NetherNetIdentity,
    probeJoin,
    SignalStructure,
    SignalType,
    verifySelfSignedIdentity
} from '@jsprismarine/nethernet';
import type { SignalingAddress, WebRtcDriver } from '@jsprismarine/nethernet';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import type { ITransport, TransportEvents, TransportStats } from './ITransport';

/** How long a join may take, signaling and WebRTC together, unless the caller says otherwise. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Where and how {@link NetherNetTransport} joins. */
export interface NetherNetTransportOptions {
    readonly host: string;
    /** The server's game port; NetherNet signals on its TCP side. */
    readonly port: number;
    /** Overall budget for the connection attempt. */
    readonly timeoutMs?: number;
    /**
     * The identity the offer is signed with, or a function that resolves it when the join starts,
     * for an identity that needs a sign-in first. A fresh self-signed one per connection by
     * default, and when the function resolves to undefined.
     */
    readonly identity?: NetherNetIdentity | (() => Promise<NetherNetIdentity | undefined>);
    /** The WebRTC stack to join over; the native library when absent. */
    readonly driver?: WebRtcDriver;
}

/**
 * The network transport for servers that speak NetherNet, joined by address as the game does:
 * probe `GET /v1/join`, post a signed offer, check the identity on the answer, then carry
 * batches over the WebRTC data channel it negotiates.
 *
 * NetherNet's wire leaves out the `0xFE` batch id, so it is put back on what arrives and taken
 * off what leaves: the session above sees batches in the form RakNet carries them. DTLS encrypts
 * the channel, so a NetherNet server sends no encryption handshake.
 */
export default class NetherNetTransport extends EventEmitter implements ITransport {
    /** DTLS encrypts the data channel. */
    public readonly encrypted = true;
    private client: NetherNetClient | null = null;
    private connected = false;
    private closed = false;

    private bytesSent = 0;
    private bytesReceived = 0;
    private packetsSent = 0;
    private packetsReceived = 0;

    public constructor(private readonly options: NetherNetTransportOptions) {
        super();
    }

    private get address(): SignalingAddress {
        return { host: this.options.host, port: this.options.port };
    }

    /**
     * Joins the server.
     * @throws {Error} When the server does not speak NetherNet, refuses the offer, answers with an
     * identity that does not verify, or the connection does not open in time.
     */
    public async connect(): Promise<void> {
        const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const deadline = AbortSignal.timeout(timeoutMs);
        if ((await probeJoin(this.address, deadline)) === undefined) {
            throw new Error(`${this.options.host}:${this.options.port} does not speak NetherNet`);
        }

        const chosen = this.options.identity;
        const identity = (typeof chosen === 'function' ? await chosen() : chosen) ?? NetherNetIdentity.client();
        const driver = this.options.driver ?? (await loadNativeDriver());

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            // Settled once and rejected before closing: closing emits `disconnect`, which would
            // otherwise fail the join a second time with "closed" and hide the real reason.
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                reject(error);
                client.close();
            };

            // Trickle ICE is off for HTTP signaling: the offer already lists every candidate.
            const client: NetherNetClient = new NetherNetClient({
                driver,
                timeoutMs,
                signal: (signal) => {
                    if (signal.type !== SignalType.ConnectRequest) return;
                    this.signal(client, identity, signal.data, deadline).catch((error: unknown) =>
                        fail(error instanceof Error ? error : new Error(String(error)))
                    );
                }
            });
            this.client = client;
            client.on('connected', () => {
                if (settled) return;
                settled = true;
                this.connected = true;
                resolve();
            });
            client.on('encapsulated', (data: Buffer) => {
                const frame = Buffer.allocUnsafe(data.byteLength + 1);
                frame[0] = BATCH_PACKET_ID;
                data.copy(frame, 1);
                this.bytesReceived += frame.byteLength;
                this.packetsReceived++;
                this.emit('batch', frame);
            });
            client.on('disconnect', (reason: string) => {
                if (!this.connected) {
                    fail(
                        new Error(
                            reason === 'connecterror:14'
                                ? `NetherNet connection did not open within ${timeoutMs} ms`
                                : `NetherNet connection failed: ${reason}`
                        )
                    );
                } else this.finish(reason);
            });

            client.connect().catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
        });
    }

    /** Signs the offer, trades it for the answer, and hands the checked answer to WebRTC. */
    private async signal(
        client: NetherNetClient,
        identity: NetherNetIdentity,
        offer: string,
        deadline: AbortSignal
    ): Promise<void> {
        const answer = await exchangeOffer(this.address, client.networkId, await identity.sign(offer), deadline);
        const { description } = await verifySelfSignedIdentity(answer);
        client.handleSignal(new SignalStructure(SignalType.ConnectResponse, client.connectionId, description));
    }

    /**
     * Sends one batch without its `0xFE` id. The data channel has no flush to skip, so the
     * priority changes nothing.
     */
    public send(payload: Buffer): void {
        if (this.client === null || !this.connected)
            throw new Error('Cannot send on a transport that is not connected');
        if (payload[0] !== BATCH_PACKET_ID) {
            throw new Error(`A NetherNet frame must be a batch, got id 0x${payload[0]?.toString(16)}`);
        }

        this.bytesSent += payload.byteLength;
        this.packetsSent++;
        this.client.send(payload.subarray(1));
    }

    /** Hangs up, and reports the close to listeners once. */
    public close(reason = 'client disconnect'): void {
        this.client?.close(reason);
        this.finish(reason);
    }

    /** Reports the end of the connection once, however it ended. */
    private finish(reason: string): void {
        if (this.closed) return;
        this.closed = true;
        this.connected = false;
        this.emit('close', reason);
    }

    /** What went past, for the bot harness's reports. */
    public getStats(): TransportStats {
        return {
            // The data channel exposes no round trip of its own; WebRTC's stats would need a poll.
            rtt: null,
            bytesSent: this.bytesSent,
            bytesReceived: this.bytesReceived,
            packetsSent: this.packetsSent,
            packetsReceived: this.packetsReceived
        };
    }

    /** Subscribes to a transport event, with its listener's own signature. */
    public override on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this {
        return super.on(event, listener);
    }

    /** Unsubscribes a listener {@link NetherNetTransport.on} added. */
    public override off<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this {
        return super.off(event, listener);
    }
}
