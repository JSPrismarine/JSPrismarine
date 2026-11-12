/**
 * Sits between a game client and a NetherNet server and writes down every message that crosses,
 * byte for byte, in both directions.
 *
 * The answer to "what does a Bedrock Dedicated Server send a real client here?", for exchanges
 * our own client cannot drive: a retail client joins the proxy, the proxy joins the server, and
 * each side's messages are handed to the other unchanged. NetherNet leaves Minecraft's encryption
 * off, so the messages are plain batches.
 *
 * One message is rewritten: the login. Bedrock Dedicated Server 1.26.60 accepts a login only on a
 * connection whose offer was signed with the login's identity key, online mode or not, and the
 * proxy cannot sign its offer with the client's key. So it logs in with a key of its own: the
 * chain is a self-signed one under the client's name and UUID, and the client data, with the
 * skin, is the client's own claims signed again. The server therefore needs `online-mode=false`.
 *
 * ```
 * node --import tsx packages/client/tools/nethernet-proxy.mts --upstream 127.0.0.1:19134 --out capture/
 * ```
 *
 * Each connection gets `<out>/connection-<n>.jsonl`: one line per message with the milliseconds
 * since the connection opened, the direction (`c2s` or `s2c`) and the message in base64, as the
 * data channel carried it. `decode-capture.mts` turns a capture into packets.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { inflateRawSync } from 'node:zlib';

import { IdentityKey, OfflineAuthProvider } from '@jsprismarine/auth';

import {
    compactEs384,
    exchangeOffer,
    HttpSignaling,
    loadNativeDriver,
    NetherNetClient,
    NetherNetIdentity,
    NetherNetServer,
    SignalStructure,
    SignalType,
    verifySelfSignedIdentity,
    withDialedCandidates
} from '@jsprismarine/nethernet';
import type { Connection } from '@jsprismarine/nethernet';

const { values } = parseArgs({
    options: {
        /** The server to join, as `host:port`. */
        upstream: { type: 'string', default: '127.0.0.1:19134' },
        /** The port clients join the proxy on. */
        port: { type: 'string', default: '19132' },
        out: { type: 'string', default: 'capture' }
    }
});

const [upstreamHost = '127.0.0.1', upstreamPort = '19134'] = values.upstream.split(':');
const upstream = { host: upstreamHost, port: Number(upstreamPort) };
fs.mkdirSync(values.out, { recursive: true });

const log = (line: string): void => console.log(`[${new Date().toISOString().slice(11, 23)}] ${line}`);
const driver = await loadNativeDriver();
const identity = NetherNetIdentity.loadOrCreate(path.join(values.out, 'proxy-identity.pem'));
const server = new NetherNetServer({ driver });
let connections = 0;

/** The claims of a JWT, read without checking it. */
const claimsOf = (jwt: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString());

const readVarUint = (buffer: Buffer, at: number): [value: number, next: number] => {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
        const byte = buffer[at++]!;
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return [value >>> 0, at];
    }
};

const varUint = (value: number): Buffer => {
    const bytes: number[] = [];
    for (let rest = value >>> 0; ; rest >>>= 7) {
        if (rest < 0x80) {
            bytes.push(rest);
            return Buffer.from(bytes);
        }
        bytes.push((rest & 0x7f) | 0x80);
    }
};

const int32le = (value: number): Buffer => {
    const out = Buffer.alloc(4);
    out.writeInt32LE(value);
    return out;
};

/**
 * The client's login message as one the proxy's own key signed: the same protocol version, a
 * self-signed chain under the client's name and UUID, and the client's own client data claims.
 * @param message - The message carrying the client's Login packet, as the data channel had it.
 * @param key - The key the proxy's offer to the server was signed with.
 * @returns The message to send the server instead, as an uncompressed batch.
 */
const rewrittenLogin = async (message: Buffer, key: IdentityKey): Promise<Buffer> => {
    // The first byte names the compression: 0x00 raw deflate, 0xff none.
    const batch = message[0] === 0x00 ? inflateRawSync(message.subarray(1)) : message.subarray(1);
    if (message[0] !== 0x00 && message[0] !== 0xff) throw new Error(`Unsupported login compression ${message[0]}`);
    const [length, start] = readVarUint(batch, 0);
    const packet = batch.subarray(start, start + length);
    const [header, body] = readVarUint(packet, 0);
    if ((header & 0x3ff) !== 0x01) throw new Error(`Expected a Login packet, got id ${header & 0x3ff}`);

    const protocolVersion = packet.readInt32BE(body);
    const [, request] = readVarUint(packet, body + 4);
    const chainLength = packet.readInt32LE(request);
    const chain: unknown = JSON.parse(packet.subarray(request + 4, request + 4 + chainLength).toString());
    const clientDataAt = request + 4 + chainLength;
    const clientData = packet
        .subarray(clientDataAt + 4, clientDataAt + 4 + packet.readInt32LE(clientDataAt))
        .toString();

    // A signed-in client sends a token whose claims name it; an offline one sends a chain.
    const token =
        typeof chain === 'object' && chain !== null && 'Token' in chain && typeof chain.Token === 'string'
            ? claimsOf(chain.Token)
            : {};
    const displayName = typeof token.xname === 'string' ? token.xname : 'Player';
    const identity = typeof token.leguuid === 'string' ? token.leguuid : undefined;
    const auth = new OfflineAuthProvider({ displayName, key, ...(identity === undefined ? {} : { identity }) });
    const { chainData } = await auth.createLoginCredentials({ serverAddress: values.upstream, protocolVersion });
    const signedClientData = await key.sign(claimsOf(clientData));

    const chainBytes = Buffer.from(chainData);
    const clientBytes = Buffer.from(signedClientData);
    const connectionRequest = Buffer.concat([
        int32le(chainBytes.byteLength),
        chainBytes,
        int32le(clientBytes.byteLength),
        clientBytes
    ]);
    const version = Buffer.alloc(4);
    version.writeInt32BE(protocolVersion);
    const login = Buffer.concat([varUint(0x01), version, varUint(connectionRequest.byteLength), connectionRequest]);
    log(`login of ${displayName} (protocol ${protocolVersion}) signed again with the proxy's key`);
    return Buffer.concat([Buffer.from([0xff]), varUint(login.byteLength), login]);
};

/** One client and the server connection made for it. */
interface Session {
    readonly record: (direction: 'c2s' | 's2c', message: Buffer) => void;
    readonly toServer: (message: Buffer) => void;
}

const sessions = new Map<bigint, Session>();

/** Joins the server for a client, the first time anything is heard of that client. */
const sessionOf = (id: bigint): Session | undefined => {
    const existing = sessions.get(id);
    if (existing !== undefined) return existing;
    const downstream = server.connections.get(id);
    if (downstream === undefined) return undefined;

    const number = ++connections;
    const opened = Date.now();
    const file = fs.createWriteStream(path.join(values.out, `connection-${number}.jsonl`));
    const record = (direction: 'c2s' | 's2c', message: Buffer): void => {
        file.write(`${JSON.stringify({ t: Date.now() - opened, d: direction, m: message.toString('base64') })}\n`);
    };
    log(`client ${number} connecting`);

    // What the client sent before the server was joined, in order. A client sends its first
    // packet as soon as its reliable channel opens.
    const waiting: Buffer[] = [];
    let joined = false;
    // The key the offer to the server and the login are both signed with.
    const key = IdentityKey.generate();
    let fromClient = 0;
    const client: NetherNetClient = new NetherNetClient({
        driver,
        signal: (signal) => {
            if (signal.type !== SignalType.ConnectRequest) return;
            void (async () => {
                const now = Math.floor(Date.now() / 1000);
                const token = await compactEs384(
                    { x5u: key.publicKeyDer },
                    { exp: now + 60, iat: now, cpk: key.publicKeyDer },
                    key.privateKey
                );
                const offer = await new NetherNetIdentity(key.privateKey, { keyFormat: 'der', token }).sign(
                    signal.data
                );
                const answer = await exchangeOffer(upstream, client.networkId, offer);
                const { description } = await verifySelfSignedIdentity(answer);
                client.handleSignal(new SignalStructure(SignalType.ConnectResponse, client.connectionId, description));
            })().catch((error: unknown) => {
                log(`client ${number}: joining the server failed: ${String(error)}`);
                downstream.close('upstream failed');
            });
        }
    });
    client.on('connected', () => {
        joined = true;
        log(`client ${number}: joined ${upstream.host}:${upstream.port}`);
        for (const message of waiting.splice(0)) client.send(message);
    });
    client.on('encapsulated', (message: Buffer) => {
        record('s2c', message);
        if (!downstream.closed) downstream.send(message);
    });
    client.on('disconnect', (reason: string) => {
        log(`client ${number}: the server closed (${reason})`);
        if (!downstream.closed) downstream.close(reason);
    });
    downstream.once('close', (reason: string) => {
        log(`client ${number} closed (${reason})`);
        sessions.delete(id);
        client.close(reason);
        file.end();
    });
    void client.connect();

    // Messages go on in the order they came, the login among them once it is signed again.
    let order: Promise<void> = Promise.resolve();
    const forward = (message: Buffer): void => {
        if (joined) client.send(message);
        else waiting.push(message);
    };
    const session: Session = {
        record,
        toServer: (message) => {
            // The client's second message is its login; the first asked for the network settings.
            const isLogin = fromClient++ === 1;
            order = order
                .then(async () => forward(isLogin ? await rewrittenLogin(message, key) : message))
                .catch((error: unknown) => {
                    log(`client ${number}: ${String(error)}`);
                    downstream.close('proxy failed');
                });
        }
    };
    sessions.set(id, session);
    return session;
};

server.on('openConnection', (connection: Connection) => void sessionOf(connection.id));
server.on('encapsulated', (message: Buffer, id: bigint) => {
    const session = sessionOf(id);
    if (session === undefined) return;
    session.record('c2s', message);
    session.toServer(message);
});

const signaling = new HttpSignaling({
    answerer: server,
    status: () => '',
    sign: (answer, dialed) => identity.sign(withDialedCandidates(answer, dialed)),
    logger: { debug: log, info: log, warn: log, error: (error) => log(String(error)) }
});
const port = await signaling.listen(Number(values.port), '0.0.0.0');
log(`proxy listening on ${port}, forwarding to ${upstream.host}:${upstream.port}, writing to ${values.out}`);

process.on('SIGINT', () => {
    signaling.close();
    server.close('proxy stopped');
    process.exit(0);
});
