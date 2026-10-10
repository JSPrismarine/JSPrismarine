import { ClientSocket, ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import { EventEmitter } from 'node:events';
import { SendPriority, type ITransport, type TransportEvents, type TransportStats } from './ITransport';

import type { Logger } from '@jsprismarine/logger';
import type { RakNetSession } from '@jsprismarine/raknet';

export interface RakNetTransportOptions {
    readonly host: string;
    readonly port: number;
    /** Overall budget for the connection attempt. */
    readonly timeoutMs?: number;
}

/**
 * The network transport: RakNet over UDP.
 *
 * A thin wrapper, and meant to stay that way. Everything hard about carrying bytes -
 * ordering, acknowledgement, fragmentation, retransmission - is `ClientSocket`'s and the
 * session's, so what is left here is counting what went past and translating two event
 * names.
 */
export default class RakNetTransport extends EventEmitter implements ITransport {
    private readonly socket: ClientSocket;
    private session: RakNetSession | null = null;

    private bytesSent = 0;
    private bytesReceived = 0;
    private packetsSent = 0;
    private packetsReceived = 0;
    /** The last measurement taken while the session was alive; see the close handler. */
    private lastRtt: number | null = null;

    public constructor(
        logger: Logger,
        private readonly options: RakNetTransportOptions
    ) {
        super();

        this.socket = new ClientSocket(logger, { timeoutMs: options.timeoutMs });

        this.socket.on('encapsulated', (frame: Protocol.Frame) => {
            this.bytesReceived += frame.content.byteLength;
            this.packetsReceived++;
            this.emit('batch', frame.content);
        });

        // `removeSession` may be reached with no reason at all - a RakNet timeout has none -
        // so this is genuinely optional, whatever the emitting call site looks like.
        this.socket.on('closeConnection', (_address: unknown, reason?: string) => {
            // Read before the session goes, because it is the only thing that knows it. A
            // load report is produced *after* the run ends, so an RTT that lives only on a
            // live session is an RTT no report ever sees - it came out as "-" every time.
            this.lastRtt = this.session?.getRTT() ?? this.lastRtt;
            this.session = null;
            this.emit('close', reason ?? 'connection closed');
        });
    }

    public async connect(): Promise<void> {
        this.session = await this.socket.connect(this.options.host, this.options.port);
    }

    public send(payload: Buffer, priority: SendPriority = SendPriority.NORMAL): void {
        if (this.session === null) throw new Error('Cannot send on a transport that is not connected');

        const frame = new Protocol.Frame();
        // Reliable ordered on channel 0, which is what Minecraft uses for everything: the
        // client applies packets in the order the server stamped them, and a batch that
        // overtook the chunk it belonged to would be applied against terrain not yet there.
        frame.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = payload;

        this.bytesSent += payload.byteLength;
        this.packetsSent++;

        this.session.sendFrame(
            frame,
            priority === SendPriority.IMMEDIATE ? ConnectionPriority.IMMEDIATE : ConnectionPriority.NORMAL
        );
    }

    public close(reason = 'client disconnect'): void {
        this.socket.disconnect(reason);
        this.socket.kill();
    }

    public getStats(): TransportStats {
        this.lastRtt = this.session?.getRTT() ?? this.lastRtt;

        return {
            rtt: this.lastRtt,
            bytesSent: this.bytesSent,
            bytesReceived: this.bytesReceived,
            packetsSent: this.packetsSent,
            packetsReceived: this.packetsReceived
        };
    }

    public override on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this {
        return super.on(event, listener as (...args: any[]) => void);
    }

    public override off<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this {
        return super.off(event, listener as (...args: any[]) => void);
    }
}
