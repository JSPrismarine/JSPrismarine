import { createHash } from 'node:crypto';

/** One accepted client packet, before its handler changes server state. */
export interface InboundPacketRecord {
    /** Process-local identity assigned when the dispatcher admits the connection. */
    readonly connectionId: number;
    /** Zero-based order across all packets accepted by this server process. */
    readonly order: number;
    /** Zero-based order among accepted packets from this connection. */
    readonly sequence: number;
    /** Server tick when the containing transport frame arrived, before handler queueing. */
    readonly tick: number;
    /** Protocol version used to decode the packet. */
    readonly protocolVersion: number;
    /** Protocol packet class name. */
    readonly packetName: string;
    /** Encoded packet bytes, including the packet id and excluding the enclosing batch. */
    readonly payload: Uint8Array;
}

/** Receives accepted packet records from a server's network dispatcher. */
export interface InboundPacketRecorder {
    /** Stores or forwards one packet accepted for handler dispatch. */
    record(packet: InboundPacketRecord): void;
}

const TRACE_FORMAT = 'jsprismarine-inbound-packets';
const TRACE_VERSION = 2;
const LEGACY_TRACE_VERSION = 1;

/**
 * A process-local trace that copies packet bytes and can report or serialize its storage cost.
 *
 * Packet bytes may include identity or login data. Capture is opt-in, and the caller owns the
 * trace's storage, access control, and retention.
 */
export class InboundPacketTrace implements InboundPacketRecorder {
    private readonly captured: InboundPacketRecord[] = [];

    /** Adds a private copy of the accepted packet bytes to this trace. */
    public record(packet: InboundPacketRecord): void {
        if (packet.order !== this.captured.length) {
            throw new Error(`Inbound packet trace expected order ${this.captured.length}, got ${packet.order}`);
        }
        this.captured.push({ ...packet, payload: Buffer.from(packet.payload) });
    }

    /** Returns trace records in recorder-call order with independent packet buffers. */
    public records(): readonly InboundPacketRecord[] {
        return this.captured.map((record) => ({ ...record, payload: Buffer.from(record.payload) }));
    }

    /** The number of captured packet payload bytes, without object or encoding overhead. */
    public getPayloadBytes(): number {
        return this.captured.reduce((total, record) => total + record.payload.byteLength, 0);
    }

    /** Hashes accepted inbound packet records per arrival tick, in captured order. */
    public packetDigestsByTick(): ReadonlyMap<number, string> {
        const records = new Map<number, object[]>();
        for (const record of this.captured) {
            const atTick = records.get(record.tick) ?? [];
            atTick.push({
                connectionId: record.connectionId,
                order: record.order,
                sequence: record.sequence,
                protocolVersion: record.protocolVersion,
                packetName: record.packetName,
                payload: Buffer.from(record.payload).toString('base64')
            });
            records.set(record.tick, atTick);
        }

        return new Map(
            [...records].map(([tick, events]) => [
                tick,
                createHash('sha256').update(JSON.stringify(events)).digest('hex')
            ])
        );
    }

    /** Serializes the trace as UTF-8 JSON, with packet bytes encoded as Base64. */
    public serialize(): Buffer {
        return Buffer.from(
            JSON.stringify({
                format: TRACE_FORMAT,
                version: TRACE_VERSION,
                records: this.captured.map((record) => ({
                    connectionId: record.connectionId,
                    order: record.order,
                    sequence: record.sequence,
                    tick: record.tick,
                    protocolVersion: record.protocolVersion,
                    packetName: record.packetName,
                    payload: Buffer.from(record.payload).toString('base64')
                }))
            }),
            'utf8'
        );
    }

    /**
     * Parses a trace written by {@link InboundPacketTrace.serialize}.
     *
     * @throws {Error} When the format, version, or any record field is invalid.
     */
    public static deserialize(bytes: Uint8Array): InboundPacketTrace {
        let value: unknown;
        try {
            value = JSON.parse(Buffer.from(bytes).toString('utf8'));
        } catch {
            throw new Error('Invalid inbound packet trace JSON');
        }

        if (
            !isObject(value) ||
            value['format'] !== TRACE_FORMAT ||
            (value['version'] !== TRACE_VERSION && value['version'] !== LEGACY_TRACE_VERSION)
        ) {
            throw new Error('Unsupported inbound packet trace format or version');
        }
        if (!Array.isArray(value['records'])) throw new Error('Invalid inbound packet trace records');

        const trace = new InboundPacketTrace();
        for (const [index, valueRecord] of value['records'].entries()) {
            const order =
                value['version'] === LEGACY_TRACE_VERSION && isObject(valueRecord)
                    ? index
                    : isObject(valueRecord)
                      ? valueRecord['order']
                      : undefined;
            if (
                !isObject(valueRecord) ||
                !isPositiveInteger(valueRecord['connectionId']) ||
                !isNonNegativeInteger(order) ||
                order !== index ||
                !isNonNegativeInteger(valueRecord['sequence']) ||
                !isNonNegativeInteger(valueRecord['tick']) ||
                !isPositiveInteger(valueRecord['protocolVersion']) ||
                typeof valueRecord['packetName'] !== 'string' ||
                valueRecord['packetName'].length === 0 ||
                typeof valueRecord['payload'] !== 'string' ||
                !isCanonicalBase64(valueRecord['payload'])
            ) {
                throw new Error('Invalid inbound packet trace record');
            }

            trace.record({
                connectionId: valueRecord['connectionId'],
                order,
                sequence: valueRecord['sequence'],
                tick: valueRecord['tick'],
                protocolVersion: valueRecord['protocolVersion'],
                packetName: valueRecord['packetName'],
                payload: Buffer.from(valueRecord['payload'], 'base64')
            });
        }

        return trace;
    }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isNonNegativeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isCanonicalBase64 = (value: string): boolean => Buffer.from(value, 'base64').toString('base64') === value;
