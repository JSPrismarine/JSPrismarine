/**
 * Logs into a server and writes down every packet it sends, byte for byte.
 *
 * The answer to "what does a real server send, and in what order?" - which is the question
 * behind every protocol upgrade. Mojang's documentation says what a packet's fields are;
 * only a real server says what a client is actually given, and a layout that has drifted
 * from the client's does not fail, it hands back plausible rubbish. Bytes are the authority.
 *
 * ```
 * node packages/client/tools/dump-packets.mjs --host 127.0.0.1 --port 19132 --out capture/
 * ```
 *
 * Every packet lands in `--out` as `<sequence>-<id>.bin` with its header still on, and an
 * `index.json` beside them lists the order they arrived in. BDS needs `online-mode=false`
 * and `allow-list=false` to accept an offline identity. The client stays a few seconds after
 * spawning so that what a server sends *after* the join - chunks, entities, the first
 * movement corrections - is recorded too.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { Client } from '../dist/index.es.js';

const { values } = parseArgs({
    options: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '19132' },
        out: { type: 'string', default: 'capture' },
        name: { type: 'string', default: 'PacketDump' },
        /** Seconds to keep listening after the spawn. */
        linger: { type: 'string', default: '5' }
    }
});

fs.mkdirSync(values.out, { recursive: true });

const client = new Client({
    host: values.host,
    port: Number(values.port),
    displayName: values.name,
    loginTimeoutMs: 60_000
});

// Everything the client owns is unref'ed, so without this the process exits before the login
// has had a chance to finish.
const keepalive = setInterval(() => {}, 1000);

const index = [];
client.getSession().on('raw', ({ id, buffer }) => {
    const sequence = index.length;
    const file = `${String(sequence).padStart(4, '0')}-0x${id.toString(16).padStart(2, '0')}.bin`;
    fs.writeFileSync(path.join(values.out, file), buffer);
    index.push({ sequence, id, file, bytes: buffer.byteLength });
});

try {
    await client.connect();
    await sleep(Number(values.linger) * 1000);
    client.disconnect();

    fs.writeFileSync(path.join(values.out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

    const counts = new Map();
    for (const entry of index) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);

    console.log(`Wrote ${index.length} packets to ${values.out}`);
    for (const [id, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
        console.log(`  0x${id.toString(16).padStart(2, '0')} x${count}`);
    }
} catch (error) {
    console.error(`Could not capture: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    clearInterval(keepalive);
}
