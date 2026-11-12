import { createHash } from 'node:crypto';

/** One client packet when the server queues it for transport. */
export interface OutboundPacketRecord {
    /** Process-local identity assigned when the dispatcher admits the connection. */
    readonly connectionId: number;
    /** Zero-based order among packets queued for this connection. */
    readonly sequence: number;
    /**
     * The server tick whose work queued the packet: the tick that ran or replicated it, which for
     * a packet replication sends is the sealed tick it read, not the tick in which the transport
     * framed it ([ADR 0006](../../../../docs/adr/0006-replay-determinism-contract.md)).
     */
    readonly tick: number;
    /** Protocol version used to encode the packet. */
    readonly protocolVersion: number;
    /** Protocol packet class name. */
    readonly packetName: string;
    /** Encoded packet bytes, including the packet id and excluding the enclosing batch. */
    readonly payload: Uint8Array;
}

/** Receives clientbound packets as they are framed for a connection. */
export interface OutboundPacketRecorder {
    /** Stores or forwards one clientbound packet record. */
    record(packet: OutboundPacketRecord): void;
}

/** Keeps clientbound packet records so replay runs can compare each tick's output. */
export class OutboundPacketTrace implements OutboundPacketRecorder {
    private readonly captured: OutboundPacketRecord[] = [];

    /** Adds a private copy of the encoded packet bytes. */
    public record(packet: OutboundPacketRecord): void {
        this.captured.push({ ...packet, payload: Buffer.from(packet.payload) });
    }

    /** Returns records in transport framing order with independent packet buffers. */
    public records(): readonly OutboundPacketRecord[] {
        return this.captured.map((record) => ({ ...record, payload: Buffer.from(record.payload) }));
    }

    /** Hashes each tick's packets in connection id and per-connection sequence order. */
    public packetDigestsByTick(): ReadonlyMap<number, string> {
        const records = new Map<number, OutboundPacketRecord[]>();
        for (const record of this.captured) {
            const atTick = records.get(record.tick) ?? [];
            atTick.push(record);
            records.set(record.tick, atTick);
        }

        return new Map(
            [...records].map(([tick, packets]) => {
                // Clients have no shared order across connections, so scheduling between two
                // recipients must not change a digest for otherwise identical output.
                packets.sort((left, right) =>
                    left.connectionId === right.connectionId
                        ? left.sequence - right.sequence
                        : left.connectionId - right.connectionId
                );
                const stablePackets = packets.map((record) => ({
                    connectionId: record.connectionId,
                    sequence: record.sequence,
                    protocolVersion: record.protocolVersion,
                    packetName: record.packetName,
                    payload: Buffer.from(record.payload).toString('base64')
                }));
                return [tick, createHash('sha256').update(JSON.stringify(stablePackets)).digest('hex')];
            })
        );
    }

    /** The encoded packet bytes, without JavaScript objects or batch framing overhead. */
    public getPayloadBytes(): number {
        return this.captured.reduce((total, record) => total + record.payload.byteLength, 0);
    }
}
