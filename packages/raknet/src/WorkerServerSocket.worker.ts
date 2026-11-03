import { parentPort, workerData } from 'node:worker_threads';
import type { RemoteInfo } from 'node:dgram';
import Frame from './protocol/Frame';
import type { Logger } from './RakNetPeer';
import { RakNetPriority } from './Session';
import type RakNetSession from './Session';
import ServerSocket from './ServerSocket';
import SharedByteRing from './SharedByteRing';
import WorkerEventQueue from './WorkerEventQueue';
import { ServerName } from './utils/ServerName';
import type { ServerNameSnapshot } from './utils/ServerName';
import type { SocketBufferOptions } from './SocketBuffers';

const EVENT_CONNECTED = 1;
const EVENT_FRAME = 2;
const EVENT_CLOSED = 3;
const EVENT_RAW = 4;
const COMMAND_FRAME = 1;
const COMMAND_DISCONNECT = 2;
const COMMAND_DISCONNECT_IMMEDIATE = 3;
const COMMAND_RAW = 4;
const EVENT_HEADER_BYTES = 9;
const MAX_PENDING_BYTES = 8 * 1024 * 1024;

interface WorkerServerOptions {
    readonly address: string;
    readonly port: number;
    readonly maxConnections: number;
    readonly serverGuid: string;
    readonly name: ServerNameSnapshot;
    readonly socketBufferOptions: SocketBufferOptions;
    readonly outboundMemory: SharedArrayBuffer;
    readonly inboundMemory: SharedArrayBuffer;
    readonly metricsMemory: SharedArrayBuffer;
    readonly ringCapacity: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isServerNameSnapshot = (value: unknown): value is ServerNameSnapshot =>
    isRecord(value) &&
    typeof value.motd === 'string' &&
    typeof value.name === 'string' &&
    typeof value.protocol === 'number' &&
    typeof value.version === 'string' &&
    typeof value.onlinePlayers === 'number' &&
    typeof value.maxPlayers === 'number' &&
    typeof value.gamemode === 'string' &&
    typeof value.serverId === 'string' &&
    typeof value.port === 'number';

const isWorkerOptions = (value: unknown): value is WorkerServerOptions =>
    isRecord(value) &&
    typeof value.address === 'string' &&
    typeof value.port === 'number' &&
    typeof value.maxConnections === 'number' &&
    typeof value.serverGuid === 'string' &&
    isServerNameSnapshot(value.name) &&
    isRecord(value.socketBufferOptions) &&
    value.outboundMemory instanceof SharedArrayBuffer &&
    value.inboundMemory instanceof SharedArrayBuffer &&
    value.metricsMemory instanceof SharedArrayBuffer &&
    typeof value.ringCapacity === 'number';

const options = workerData;
if (!isWorkerOptions(options)) throw new TypeError('RakNet worker received invalid startup data');
if (!parentPort) throw new Error('RakNet worker has no parent port');

const workerPort = parentPort;
const inbound = new SharedByteRing(options.ringCapacity, options.outboundMemory);
const outbound = new SharedByteRing(options.ringCapacity, options.inboundMemory);
const metrics = new Int32Array(options.metricsMemory);
const pendingEvents = new WorkerEventQueue(outbound, MAX_PENDING_BYTES);
let nextSessionId = 1;
const idsByAddress = new Map<string, number>();
const sessionsById = new Map<number, RakNetSession>();
const lastSessionMetrics = new Map<number, { retransmissions: number; roundTrips: number }>();

const makeLogger = (): Logger => {
    const write = (level: string, values: unknown[]): void => {
        workerPort.postMessage({
            type: 'log',
            level,
            text: values
                .map((value) => (value instanceof Error ? `${value.name}: ${value.message}` : String(value)))
                .join(' ')
        });
    };

    return {
        info: (...values: unknown[]) => write('info', values),
        warn: (...values: unknown[]) => write('warn', values),
        error: (...values: unknown[]) => write('error', values),
        verbose: (...values: unknown[]) => write('verbose', values),
        debug: (...values: unknown[]) => write('debug', values),
        silly: (...values: unknown[]) => write('silly', values)
    };
};

const workerLogger = makeLogger();
const serverName = new ServerName(
    {
        getConfig: () => ({
            getMotd: () => options.name.motd,
            getGamemode: () => options.name.gamemode,
            getMaxPlayers: () => options.name.maxPlayers
        })
    },
    { protocolVersion: options.name.protocol, minecraftVersions: [options.name.version] }
);

const applyServerName = (snapshot: ServerNameSnapshot): void => {
    serverName.setMotd(snapshot.motd);
    serverName.setName(snapshot.name);
    serverName.setProtocol(snapshot.protocol);
    serverName.setVersion(snapshot.version);
    serverName.setOnlinePlayerCount(snapshot.onlinePlayers);
    serverName.setMaxPlayerCount(snapshot.maxPlayers);
    serverName.setGamemode(snapshot.gamemode);
    serverName.setServerId(BigInt(snapshot.serverId));
    serverName.setPort(snapshot.port);
};
applyServerName(options.name);

const server = new ServerSocket(
    options.maxConnections,
    false,
    serverName,
    workerLogger,
    options.socketBufferOptions,
    'copy',
    BigInt(options.serverGuid)
);

const writeEvent = (type: number, id: number, address: string, port: number, payload: Buffer): void => {
    const addressBytes = Buffer.from(address);
    const header = Buffer.allocUnsafe(EVENT_HEADER_BYTES);
    header[0] = type;
    header.writeUInt32LE(id, 1);
    header.writeUInt16LE(port, 5);
    header.writeUInt16LE(addressBytes.byteLength, 7);
    const parts = [header, addressBytes, payload];
    if (pendingEvents.write(parts)) return;

    workerLogger.error(`Inbound worker ring and ${MAX_PENDING_BYTES}-byte staging queue are full`);
    const session = sessionsById.get(id);
    if (session && !session.isClosing()) session.disconnectImmediate('network worker inbound queue overflow');
};

const drainPending = (): void => pendingEvents.drain();

server.on('openConnection', (session: RakNetSession) => {
    const id = nextSessionId++;
    const address = session.getAddress();
    sessionsById.set(id, session);
    idsByAddress.set(address.toToken(), id);

    const payload = Buffer.allocUnsafe(10);
    payload.writeUInt16LE(session.getMTU(), 0);
    payload.writeBigUInt64LE(session.guid, 2);
    writeEvent(EVENT_CONNECTED, id, address.getAddress(), address.getPort(), payload);
});

server.on('encapsulated', (frame: Frame, address: { toToken(): string; getAddress(): string; getPort(): number }) => {
    const id = idsByAddress.get(address.toToken());
    if (id === undefined) return;
    writeEvent(EVENT_FRAME, id, address.getAddress(), address.getPort(), frame.content);
});

server.on(
    'closeConnection',
    (address: { toToken(): string; getAddress(): string; getPort(): number }, reason?: string) => {
        const id = idsByAddress.get(address.toToken());
        if (id === undefined) return;
        writeEvent(EVENT_CLOSED, id, address.getAddress(), address.getPort(), Buffer.from(reason ?? 'closed'));
        idsByAddress.delete(address.toToken());
        sessionsById.delete(id);
        lastSessionMetrics.delete(id);
    }
);

server.on('raw', (buffer: Buffer, address: { getAddress(): string; getPort(): number }) => {
    writeEvent(EVENT_RAW, 0, address.getAddress(), address.getPort(), buffer);
});

const drainCommands = (): void => {
    for (;;) {
        const command = inbound.tryRead();
        if (command === null || command.byteLength === 0) return;

        const type = command[0]!;
        if (type === COMMAND_FRAME && command.byteLength >= 8) {
            const sessionId = command.readUInt32LE(1);
            const reliability = command[5]!;
            const orderChannel = command[6]!;
            const priority = command[7]!;
            const session = sessionsById.get(sessionId);
            if (!session || reliability > 7 || orderChannel >= 32 || priority > RakNetPriority.IMMEDIATE) {
                continue;
            }

            const frame = new Frame();
            frame.reliability = reliability;
            frame.orderChannel = orderChannel;
            frame.content = command.subarray(8);
            session.sendFrame(frame, priority);
            continue;
        }

        if ((type === COMMAND_DISCONNECT || type === COMMAND_DISCONNECT_IMMEDIATE) && command.byteLength >= 7) {
            const sessionId = command.readUInt32LE(1);
            const reasonLength = command.readUInt16LE(5);
            if (7 + reasonLength > command.byteLength) continue;
            const reason = command.toString('utf8', 7, 7 + reasonLength);
            const session = sessionsById.get(sessionId);
            if (!session) continue;
            if (type === COMMAND_DISCONNECT) session.disconnect(reason);
            else session.disconnectImmediate(reason);
            continue;
        }

        if (type === COMMAND_RAW && command.byteLength >= EVENT_HEADER_BYTES) {
            const port = command.readUInt16LE(5);
            const addressLength = command.readUInt16LE(7);
            const payloadOffset = EVENT_HEADER_BYTES + addressLength;
            if (payloadOffset > command.byteLength) continue;
            const rinfo: RemoteInfo = {
                address: command.toString('utf8', EVENT_HEADER_BYTES, payloadOffset),
                port,
                family: 'IPv4',
                size: 0
            };
            server.sendBuffer(command.subarray(payloadOffset), rinfo);
        }
    }
};

const updateMetrics = (): void => {
    for (const [id, session] of sessionsById) {
        const previous = lastSessionMetrics.get(id) ?? { retransmissions: 0, roundTrips: 0 };
        const retransmissions = session.getRetransmissionCount();
        const roundTrips = session.getRoundTripSampleCount();
        if (retransmissions > previous.retransmissions) {
            Atomics.add(metrics, 1, retransmissions - previous.retransmissions);
        }
        if (roundTrips > previous.roundTrips) {
            Atomics.add(metrics, 2, roundTrips - previous.roundTrips);
        }
        const rtt = session.getRTT();
        if (rtt !== null) {
            const rttMicros = Math.max(0, Math.round(rtt * 1000));
            let old = Atomics.load(metrics, 0);
            while (rttMicros > old) {
                const seen = Atomics.compareExchange(metrics, 0, old, rttMicros);
                if (seen === old) break;
                old = seen;
            }
        }
        lastSessionMetrics.set(id, { retransmissions, roundTrips });
    }
};

const pumpTimer = setInterval(() => {
    drainPending();
    drainCommands();
    updateMetrics();
}, 1);
pumpTimer.unref();

server.once('listening', (port: number) => {
    workerPort.postMessage({ type: 'ready', port, serverGuid: server.getServerGuid().toString() });
});
server.start(options.address, options.port);

workerPort.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return;
    if (message.type === 'stop') {
        drainCommands();
        clearInterval(pumpTimer);
        server.kill();
        workerPort.close();
        return;
    }

    if (message.type === 'max-connections' && 'value' in message && typeof message.value === 'number') {
        server.setMaxConnections(message.value);
        return;
    }

    if (message.type === 'server-name' && 'snapshot' in message && isServerNameSnapshot(message.snapshot)) {
        applyServerName(message.snapshot);
    }
});

workerPort.on('close', () => {
    clearInterval(pumpTimer);
    server.kill();
});
