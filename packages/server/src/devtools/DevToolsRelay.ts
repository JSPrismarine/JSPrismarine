import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { createDevToolsFrontendUrl } from './DevTools';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME_SIZE = 64 * 1024 * 1024;

interface CdpCommand {
    id?: number;
    method: string;
    params?: Record<string, unknown>;
}

interface CachedCommand {
    method: string;
    params: Record<string, unknown>;
}

interface PendingCommand {
    message: string;
    stateKey?: string;
}

interface RequestState {
    stateKey?: string;
    replayed: boolean;
}

interface WebSocketFrame {
    fin: boolean;
    opcode: number;
    payload: Buffer;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const stateKey = (command: CdpCommand): string | undefined => {
    const params = command.params ?? {};
    if (command.method.endsWith('.enable')) return command.method;
    if (command.method.endsWith('.disable')) return undefined;
    if (
        command.method === 'Debugger.setPauseOnExceptions' ||
        command.method === 'Debugger.setAsyncCallStackDepth' ||
        command.method === 'Debugger.setBreakpointsActive'
    ) {
        return command.method;
    }
    if (
        command.method === 'Debugger.setBreakpointByUrl' ||
        command.method === 'Debugger.setInstrumentationBreakpoint' ||
        command.method === 'Debugger.setBlackboxPatterns'
    ) {
        return `${command.method}:${JSON.stringify(params)}`;
    }
    return undefined;
};

const decodeFrame = (input: Buffer): { frame: WebSocketFrame; rest: Buffer } | undefined => {
    if (input.length < 2) return undefined;
    const first = input[0]!;
    const second = input[1]!;
    if ((first & 0x70) !== 0) throw new Error('Unsupported WebSocket extension');

    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
        if (input.length < offset + 2) return undefined;
        length = input.readUInt16BE(offset);
        offset += 2;
    } else if (length === 127) {
        if (input.length < offset + 8) return undefined;
        const extended = input.readBigUInt64BE(offset);
        if (extended > BigInt(MAX_FRAME_SIZE)) throw new Error('WebSocket frame is too large');
        length = Number(extended);
        offset += 8;
    }
    const masked = (second & 0x80) !== 0;
    if (!masked) throw new Error('Client WebSocket frames must be masked');
    if (input.length < offset + 4 + length) return undefined;

    const mask = input.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(input.subarray(offset, offset + length));
    for (let index = 0; index < payload.length; index++) payload[index] = payload[index]! ^ mask[index % 4]!;

    return {
        frame: { fin: (first & 0x80) !== 0, opcode: first & 0x0f, payload },
        rest: input.subarray(offset + length)
    };
};

const encodeFrame = (opcode: number, payload: Buffer): Buffer => {
    const headerSize = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10;
    const frame = Buffer.allocUnsafe(headerSize + payload.length);
    frame[0] = 0x80 | opcode;
    if (headerSize === 2) frame[1] = payload.length;
    else if (headerSize === 4) {
        frame[1] = 126;
        frame.writeUInt16BE(payload.length, 2);
    } else {
        frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    payload.copy(frame, headerSize);
    return frame;
};

/**
 * Keeps a browser DevTools connection attached while watch mode replaces the server process.
 *
 * The relay only listens on loopback. Its frontend URL uses a stable WebSocket path, while the
 * upstream Node inspector endpoint can change after each child restart.
 */
export class DevToolsRelay {
    private readonly token = randomUUID();
    private readonly connections = new Set<RelayConnection>();
    private readonly server = createServer((_request, response) => {
        response.writeHead(404);
        response.end();
    });
    private port: number | undefined;
    private targetUrl: string | undefined;
    private closed = false;

    /** Creates a relay for the inspector endpoint of a server process. */
    public constructor() {
        this.server.on('upgrade', (request, socket, head) => this.accept(request, socket, head));
        this.server.on('clientError', (_error, socket) => socket.destroy());
    }

    /** Opens the relay on an available loopback port. */
    public async start(): Promise<void> {
        if (this.port !== undefined) return;
        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => reject(error);
            this.server.once('error', onError);
            this.server.listen(0, '127.0.0.1', () => {
                this.server.off('error', onError);
                const address = this.server.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('DevTools relay did not provide a TCP address'));
                    return;
                }
                this.port = address.port;
                resolve();
            });
        });
    }

    /** The stable loopback WebSocket address for this relay. */
    public get endpointUrl(): string {
        if (this.port === undefined) throw new Error('DevTools relay has not started');
        return `ws://127.0.0.1:${this.port}/${this.token}`;
    }

    /** The browser-safe frontend URL connected to this relay. */
    public get frontendUrl(): string {
        return createDevToolsFrontendUrl(this.endpointUrl);
    }

    /**
     * Changes the Node inspector endpoint that receives browser CDP messages.
     *
     * @param endpointUrl - The current server child's loopback inspector URL.
     */
    public setTarget(endpointUrl: string | undefined): void {
        if (endpointUrl === this.targetUrl) return;
        if (endpointUrl !== undefined) {
            const target = new URL(endpointUrl);
            if (target.protocol !== 'ws:' || target.hostname !== '127.0.0.1') {
                throw new Error('DevTools relay targets must be Node inspector sockets on 127.0.0.1');
            }
        }
        this.targetUrl = endpointUrl;
        for (const connection of this.connections) connection.setTarget(endpointUrl);
    }

    /** Closes connected frontends and stops the loopback relay. */
    public async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        for (const connection of this.connections) connection.close();
        this.connections.clear();
        if (this.port === undefined) return;
        await new Promise<void>((resolve, reject) => {
            this.server.close((error) => (error ? reject(error) : resolve()));
        });
        this.port = undefined;
    }

    private accept(request: IncomingMessage, socket: Duplex, head: Buffer): void {
        let pathname: string;
        try {
            pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        } catch {
            socket.destroy();
            return;
        }
        const key = request.headers['sec-websocket-key'];
        if (
            this.closed ||
            pathname !== `/${this.token}` ||
            request.headers.upgrade?.toLowerCase() !== 'websocket' ||
            request.headers['sec-websocket-version'] !== '13' ||
            typeof key !== 'string'
        ) {
            socket.destroy();
            return;
        }

        const accept = createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64');
        socket.write(
            [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Accept: ${accept}`,
                '',
                ''
            ].join('\r\n')
        );

        let connection: RelayConnection;
        connection = new RelayConnection(socket, this.targetUrl, () => this.connections.delete(connection));
        this.connections.add(connection);
        if (head.length > 0) connection.receive(head);
    }
}

class RelayConnection {
    private backend: WebSocket | undefined;
    private backendReady = false;
    private endpointUrl: string | undefined;
    private input: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    private fragmentOpcode: number | undefined;
    private fragmentPayloads: Buffer[] = [];
    private readonly state = new Map<string, CachedCommand>();
    private readonly pending: PendingCommand[] = [];
    private readonly requests = new Map<number, RequestState>();
    private readonly breakpointKeyById = new Map<string, string>();
    private readonly currentBreakpointIdByKey = new Map<string, string>();
    private nextSyntheticId = 2_000_000_000;
    private ended = false;

    public constructor(
        private readonly socket: Duplex,
        endpointUrl: string | undefined,
        private readonly onClose: () => void
    ) {
        this.socket.on('data', (chunk: Buffer) => this.receive(chunk));
        this.socket.on('close', () => this.end());
        this.socket.on('error', () => this.end());
        this.setTarget(endpointUrl);
    }

    public setTarget(endpointUrl: string | undefined): void {
        if (endpointUrl === this.endpointUrl || this.ended) return;
        this.endpointUrl = endpointUrl;
        this.backendReady = false;
        this.failInFlight();
        const previous = this.backend;
        this.backend = undefined;
        previous?.close(1001, 'Server restarted');
        if (endpointUrl !== undefined) this.connectBackend(endpointUrl);
    }

    public receive(chunk: Buffer): void {
        if (this.ended) return;
        this.input = Buffer.concat([this.input, chunk]);
        try {
            while (true) {
                const decoded = decodeFrame(this.input);
                if (!decoded) return;
                this.input = decoded.rest;
                if (!this.receiveFrame(decoded.frame)) return;
            }
        } catch {
            this.close(1002, 'Invalid WebSocket frame');
        }
    }

    public close(code = 1001, reason = 'Relay closed'): void {
        if (this.ended) return;
        this.sendFrame(8, Buffer.concat([Buffer.from([code >> 8, code & 0xff]), Buffer.from(reason)]));
        this.socket.end();
        this.end();
    }

    private receiveFrame(frame: WebSocketFrame): boolean {
        if (frame.opcode === 8) {
            this.close(1000, 'Frontend closed');
            return false;
        }
        if (frame.opcode === 9) {
            this.sendFrame(10, frame.payload);
            return true;
        }
        if (frame.opcode === 10) return true;

        if (frame.opcode === 1 || frame.opcode === 2) {
            if (this.fragmentOpcode !== undefined) {
                this.close(1002, 'Unexpected WebSocket message');
                return false;
            }
            if (!frame.fin) {
                this.fragmentOpcode = frame.opcode;
                this.fragmentPayloads = [frame.payload];
                return true;
            }
            return this.handleMessage(frame.opcode, frame.payload);
        }

        if (frame.opcode !== 0 || this.fragmentOpcode === undefined) {
            this.close(1002, 'Unexpected WebSocket continuation');
            return false;
        }
        this.fragmentPayloads.push(frame.payload);
        if (!frame.fin) return true;
        const opcode = this.fragmentOpcode;
        const payload = Buffer.concat(this.fragmentPayloads);
        this.fragmentOpcode = undefined;
        this.fragmentPayloads = [];
        return this.handleMessage(opcode, payload);
    }

    private handleMessage(opcode: number, payload: Buffer): boolean {
        if (opcode !== 1) {
            this.close(1003, 'Only CDP text messages are supported');
            return false;
        }
        const message = payload.toString('utf8');
        let command: CdpCommand;
        try {
            const parsed: unknown = JSON.parse(message);
            if (!isRecord(parsed)) return true;
            const candidate = parsed;
            if (typeof candidate.method !== 'string') return true;
            command = {
                id: typeof candidate.id === 'number' ? candidate.id : undefined,
                method: candidate.method,
                params: isRecord(candidate.params) ? candidate.params : {}
            };
        } catch {
            this.close(1007, 'CDP message must be JSON');
            return false;
        }

        const cachedKey = this.trackCommand(command);
        const rewritten = this.rewriteBreakpointRemoval(command);
        const outgoing = JSON.stringify(rewritten);
        if (!this.backendReady || !this.backend || this.backend.readyState !== WebSocket.OPEN) {
            this.pending.push({ message: outgoing, stateKey: cachedKey });
            return true;
        }
        this.sendToBackend(outgoing, command.id, cachedKey, false);
        return true;
    }

    private trackCommand(command: CdpCommand): string | undefined {
        const params = command.params ?? {};
        if (command.method.endsWith('.disable')) {
            this.state.delete(`${command.method.slice(0, -'.disable'.length)}.enable`);
            if (command.method === 'Debugger.disable') {
                for (const key of this.state.keys()) {
                    if (key.startsWith('Debugger.set')) this.state.delete(key);
                }
            }
            return undefined;
        }

        const key = stateKey(command);
        if (!key) return undefined;
        this.state.set(key, { method: command.method, params });
        return key;
    }

    private rewriteBreakpointRemoval(command: CdpCommand): CdpCommand {
        if (command.method !== 'Debugger.removeBreakpoint') return command;
        const oldId = command.params?.breakpointId;
        if (typeof oldId !== 'string') return command;
        const key = this.breakpointKeyById.get(oldId);
        if (key) {
            this.state.delete(key);
            const currentId = this.currentBreakpointIdByKey.get(key);
            if (currentId) {
                this.breakpointKeyById.set(currentId, key);
                return { ...command, params: { ...command.params, breakpointId: currentId } };
            }
        }
        return command;
    }

    private connectBackend(endpointUrl: string): void {
        const backend = new WebSocket(endpointUrl);
        this.backend = backend;
        backend.addEventListener('open', () => {
            if (this.backend !== backend || this.ended) {
                backend.close();
                return;
            }
            this.backendReady = true;
            this.replayState();
            for (const pending of this.pending.splice(0)) {
                const command = this.parseCommand(pending.message);
                this.sendToBackend(pending.message, command?.id, pending.stateKey, false);
            }
        });
        backend.addEventListener('message', ({ data }) => {
            if (this.backend !== backend || this.ended) return;
            if (typeof data !== 'string') {
                this.close(1003, 'Inspector sent a non-text CDP message');
                return;
            }
            const text = data;
            if (this.handleBackendMessage(text)) this.sendFrame(1, Buffer.from(text));
        });
        backend.addEventListener('close', () => {
            if (this.backend !== backend) return;
            this.backend = undefined;
            this.backendReady = false;
            this.failInFlight();
        });
        backend.addEventListener('error', () => {
            if (this.backend !== backend) return;
            this.backend = undefined;
            this.backendReady = false;
            this.failInFlight();
        });
    }

    private replayState(): void {
        const queuedStateKeys = new Set(this.pending.flatMap(({ stateKey }) => (stateKey ? [stateKey] : [])));
        for (const [key, command] of this.state) {
            if (queuedStateKeys.has(key)) continue;
            const id = this.nextSyntheticId++;
            this.sendToBackend(JSON.stringify({ id, method: command.method, params: command.params }), id, key, true);
        }
    }

    private sendToBackend(message: string, id: number | undefined, key: string | undefined, replayed: boolean): void {
        const backend = this.backend;
        if (!backend || backend.readyState !== WebSocket.OPEN) {
            this.pending.push({ message, stateKey: key });
            return;
        }
        if (id !== undefined) this.requests.set(id, { stateKey: key, replayed });
        backend.send(message);
    }

    private handleBackendMessage(message: string): boolean {
        try {
            const value: unknown = JSON.parse(message);
            if (!isRecord(value)) return true;
            if (typeof value.id !== 'number') return true;
            const request = this.requests.get(value.id);
            if (!request) return true;
            this.requests.delete(value.id);
            if (request.stateKey && isRecord(value.result)) {
                const breakpointId = value.result.breakpointId;
                if (typeof breakpointId === 'string') {
                    this.breakpointKeyById.set(breakpointId, request.stateKey);
                    this.currentBreakpointIdByKey.set(request.stateKey, breakpointId);
                }
            }
            return !request.replayed;
        } catch {
            return true;
        }
    }

    private parseCommand(message: string): CdpCommand | undefined {
        try {
            const value: unknown = JSON.parse(message);
            if (!isRecord(value)) return undefined;
            const candidate = value;
            if (typeof candidate.method !== 'string') return undefined;
            return {
                id: typeof candidate.id === 'number' ? candidate.id : undefined,
                method: candidate.method,
                params: isRecord(candidate.params) ? candidate.params : {}
            };
        } catch {
            return undefined;
        }
    }

    private failInFlight(): void {
        for (const [id, request] of this.requests) {
            if (!request.replayed) {
                this.sendFrame(
                    1,
                    Buffer.from(JSON.stringify({ id, error: { code: -32000, message: 'Server restarted' } }))
                );
            }
        }
        this.requests.clear();
    }

    private sendFrame(opcode: number, payload: Buffer): void {
        if (!this.ended && !this.socket.destroyed) this.socket.write(encodeFrame(opcode, payload));
    }

    private end(): void {
        if (this.ended) return;
        this.ended = true;
        this.backend?.close(1000, 'Frontend disconnected');
        this.backend = undefined;
        this.onClose();
    }
}
