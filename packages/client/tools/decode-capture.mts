/**
 * Turns a capture `nethernet-proxy.mts` wrote into packets: one line per packet with the time,
 * the direction, the packet id and name, and its size, and each packet's bytes, header on, in a
 * directory beside the capture.
 *
 * ```
 * node --import tsx packages/client/tools/decode-capture.mts capture/connection-1.jsonl
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inflateRawSync } from 'node:zlib';

import { PacketIdentifier } from '@jsprismarine/protocol';

const file = process.argv[2];
if (file === undefined) throw new Error('Usage: decode-capture.mts <connection-n.jsonl>');
const out = file.replace(/\.jsonl$/, '.packets');
fs.mkdirSync(out, { recursive: true });

const names = new Map<number, string>();
for (const [name, id] of Object.entries(PacketIdentifier)) if (typeof id === 'number') names.set(id, name);

const readVarUint = (buffer: Buffer, at: number): [value: number, next: number] => {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
        const byte = buffer[at++]!;
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return [value >>> 0, at];
    }
};

// Until the server's NetworkSettings arrives, a message is a bare batch. After it, the first
// byte names the compression: 0x00 raw deflate, 0xff none.
const settled = { c2s: false, s2c: false };
const index: string[] = [];
let sequence = 0;
for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    const { t, d, m }: { t: number; d: 'c2s' | 's2c'; m: string } = JSON.parse(line);
    const message = Buffer.from(m, 'base64');
    let batch: Buffer;
    if (!settled[d]) batch = message;
    else if (message[0] === 0x00) batch = inflateRawSync(message.subarray(1));
    else if (message[0] === 0xff) batch = message.subarray(1);
    else throw new Error(`Unsupported compression ${message[0]} at ${t} ms`);

    for (let at = 0; at < batch.byteLength;) {
        const [length, start] = readVarUint(batch, at);
        const packet = batch.subarray(start, start + length);
        at = start + length;
        const id = readVarUint(packet, 0)[0] & 0x3ff;
        const name = names.get(id) ?? `UNKNOWN_${id}`;
        const stem = `${String(sequence++).padStart(5, '0')}-${d}-${name}`;
        fs.writeFileSync(path.join(out, `${stem}.bin`), packet);
        index.push(`${t}\t${d}\t${id}\t${name}\t${packet.byteLength}\t${stem}.bin`);
        // Both sides compress from the message after the settings exchange.
        if (id === PacketIdentifier.NETWORK_SETTINGS) settled.c2s = settled.s2c = true;
    }
}
fs.writeFileSync(path.join(out, 'index.tsv'), `${index.join('\n')}\n`);
console.log(`${sequence} packets in ${out}`);
