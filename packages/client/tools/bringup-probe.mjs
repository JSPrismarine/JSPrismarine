/**
 * Walks a full login against a real server and reports each stage, for protocol bring-up.
 *
 * The login is the one exchange that exercises both wire directions of every join-path packet:
 * our encoders produce what the server has to accept, our decoders read what it answers, and the
 * handshake only advances when both sides agreed on every byte so far. So "our client reaches
 * spawn against a real Bedrock Dedicated Server of version N" is the cheapest whole-stack check
 * a new protocol version has, and this probe turns it into a pass/fail per stage:
 *
 * ```
 * network settings -> login -> resource packs -> start game -> spawn
 * ```
 *
 * On failure it prints what a developer iterates on: the stage that did not complete, the error,
 * every packet the client failed to decode (id, size and the decoder's own message, which carries
 * the read offset), and the last raw packets seen before it died.
 *
 * Run it against a server of the version you are bringing up:
 *
 * ```
 * node packages/client/tools/bringup-probe.mjs --port 19132 --protocol 2225
 * ```
 *
 * `pnpm run bringup --protocol <n>` stages and boots the pinned server and then runs this;
 * see `packages/bedrock-data/utils/bedrock-dump/bringup.ts`. Exit status 0 means spawned.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import { Logger } from '../../logger/dist/index.es.js';
import { PacketIdentifier, PlayStatus } from '../../protocol/dist/index.es.js';
import { Client } from '../dist/index.es.js';

const { values } = parseArgs({
    options: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '19132' },
        /** Which protocol to log in with; the server admits its own version and no other. */
        protocol: { type: 'string', default: '' },
        timeout: { type: 'string', default: '60000' }
    }
});

/** The join, as five observable stages. Order matters: a stage can only follow the one before. */
const STAGES = [
    { name: 'network settings', explains: 'NetworkSettings answered RequestNetworkSettings; compression agreed' },
    { name: 'login', explains: 'PlayStatus(LoginSuccess) accepted the Login JWT chain' },
    { name: 'resource packs', explains: 'ResourcePacksInfo and ResourcePackStack negotiated' },
    { name: 'start game', explains: 'StartGame decoded with the layout for this protocol' },
    { name: 'spawn', explains: 'PlayStatus(PlayerSpawn) reached; SetLocalPlayerAsInitialized sent' }
];
const reached = new Set();

/** Lines the client logged about bytes it could not read: the packet id and offset to iterate on. */
const decodeProblems = [];
/** The last raw packets off the wire, newest last, for "what was the server sending when it died". */
const lastRaw = [];

// `onLine` hands listeners the bare message, before the timestamp and color formatting, which
// is exactly the part worth keeping. Nothing attaches a console, so the client logs nowhere else.
const logger = new Logger('warn');
logger.onLine((message) => {
    if (message.includes('Failed to decode packet') || message.includes('failed to decode a batch')) {
        decodeProblems.push(message);
    }
});

const client = new Client({
    host: values.host,
    port: Number(values.port),
    displayName: 'BringupProbe',
    logger,
    loginTimeoutMs: Number(values.timeout),
    ...(values.protocol === '' ? {} : { protocolVersion: Number(values.protocol) })
});

// Everything the client owns is unref'ed, so without this the process exits before the login
// has had a chance to finish.
const keepalive = setInterval(() => {}, 1000);

client.on('packet', (packet) => {
    if (packet.id === PacketIdentifier.NETWORK_SETTINGS) reached.add('network settings');
    if (packet.id === PacketIdentifier.PLAY_STATUS && packet.data.status === PlayStatus.LoginSuccess)
        reached.add('login');
    if (packet.id === PacketIdentifier.START_GAME) reached.add('start game');
});

client.getSession().on('raw', ({ id, buffer }) => {
    // The stack arrives only after the server took our HaveAllPacks answer, so seeing it means
    // the negotiation held in both directions.
    if (id === PacketIdentifier.RESOURCE_PACK_STACK) reached.add('resource packs');
    lastRaw.push({ id, bytes: buffer.byteLength });
    if (lastRaw.length > 12) lastRaw.shift();
});

const hex = (id) => `0x${id.toString(16).padStart(2, '0')}`;

let failure = null;
try {
    const startGame = await client.connect();
    reached.add('spawn');
    console.log(
        `Spawned as runtime entity ${startGame.runtimeEntityId} on ` +
            `${startGame.serverVersion} (protocol ${values.protocol === '' ? 'default' : values.protocol})`
    );
} catch (error) {
    failure = error instanceof Error ? error.message : String(error);
} finally {
    clearInterval(keepalive);
    client.disconnect();
}

console.log('');
let blocked = false;
for (const stage of STAGES) {
    const state = reached.has(stage.name) ? 'PASS' : blocked ? 'SKIP' : 'FAIL';
    if (state === 'FAIL') blocked = true;
    console.log(`${state}  ${stage.name.padEnd(17)} ${state === 'PASS' ? stage.explains : ''}`.trimEnd());
}

if (failure !== null) {
    console.log('');
    console.log(`The login did not reach spawn: ${failure}`);
    if (decodeProblems.length > 0) {
        console.log('Packets this client could not decode (id, then the reader message with its offset):');
        for (const problem of decodeProblems) console.log(`  ${problem}`);
    }
    if (lastRaw.length > 0) {
        console.log(
            `Last raw packets off the wire: ${lastRaw.map(({ id, bytes }) => `${hex(id)} (${bytes} B)`).join(', ')}`
        );
    }
    process.exitCode = 1;
}
