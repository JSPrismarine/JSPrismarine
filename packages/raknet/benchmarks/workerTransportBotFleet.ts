import { parentPort, workerData } from 'node:worker_threads';
import ClientSocket from '../src/ClientSocket';
import Frame from '../src/protocol/Frame';
import { FrameReliability } from '../src/protocol/FrameReliability';
import type { Logger } from '../src/RakNetPeer';

interface BotFleetOptions {
    readonly bots: number;
    readonly port: number;
    readonly seed: number;
}

const isBotFleetOptions = (value: unknown): value is BotFleetOptions =>
    typeof value === 'object' &&
    value !== null &&
    'bots' in value &&
    typeof value.bots === 'number' &&
    'port' in value &&
    typeof value.port === 'number' &&
    'seed' in value &&
    typeof value.seed === 'number';

const options: unknown = workerData;
if (!isBotFleetOptions(options)) throw new TypeError('RakNet benchmark bot worker received invalid startup data');
if (!parentPort) throw new Error('RakNet benchmark bot worker has no parent port');

const botPort = parentPort;
const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {},
    debug: () => {},
    silly: () => {}
};

let randomState = options.seed >>> 0;
const nextRandom = (): number => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return randomState >>> 0;
};

const clients: ClientSocket[] = [];
// ClientSocket deliberately unreferences its UDP handle and timers; keep this fleet worker
// alive while its top-level connect promises are still waiting for the server handshake.
const connectionKeepAlive = setInterval(() => {}, 1000);
const sessions = await Promise.all(
    Array.from({ length: options.bots }, async () => {
        const client = new ClientSocket(logger);
        clients.push(client);
        return client.connect('127.0.0.1', options.port);
    })
);
clearInterval(connectionKeepAlive);

botPort.postMessage({ type: 'ready', clients: clients.length });
let tick = 0;
const sendTimer = setInterval(() => {
    for (let bot = 0; bot < sessions.length; bot++) {
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = Buffer.allocUnsafe(64);
        frame.content.writeUInt32LE(bot, 0);
        frame.content.writeUInt32LE(tick, 4);
        for (let offset = 8; offset < frame.content.byteLength; offset += 4) {
            frame.content.writeUInt32LE(nextRandom(), offset);
        }
        sessions[bot]!.sendFrame(frame);
    }
    tick++;
}, 50);

botPort.on('message', (message: unknown) => {
    if (message !== 'stop') return;
    clearInterval(sendTimer);
    for (const client of clients) client.kill();
    botPort.close();
});
