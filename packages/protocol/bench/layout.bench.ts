/**
 * Measures a cached layout lookup and a small packet encode.
 *
 * Run with `pnpm --filter @jsprismarine/protocol run bench:layout-cache`.
 */
import { performance } from 'node:perf_hooks';
import UpdateBlockPacket from '../src/packet/UpdateBlockPacket';
import { updateBlockPacket } from '../src/wire/definitions/blocks';
import { layoutAt } from '../src/wire/WireLayout';

const protocolVersion = 2225;
const iterations = 1_000_000;

const measure = (name: string, run: () => void): void => {
    for (let index = 0; index < 100_000; index++) run();

    const started = performance.now();
    for (let index = 0; index < iterations; index++) run();
    const nanosecondsPerOperation = ((performance.now() - started) * 1_000_000) / iterations;
    console.log(JSON.stringify({ benchmark: 'protocol-wire-layout', case: name, nanosecondsPerOperation }));
};

measure('layoutAt-update-block', () => void layoutAt(updateBlockPacket, protocolVersion));

let digest = 0;
measure('update-block-encode', () => {
    const packet = new UpdateBlockPacket();
    packet.codecProtocol = protocolVersion;
    packet.x = digest & 15;
    packet.y = 64;
    packet.z = 0;
    packet.blockRuntimeId = digest & 255;
    packet.encode();
    digest = (digest + packet.getBuffer().byteLength) >>> 0;
});
console.log(JSON.stringify({ benchmark: 'protocol-wire-layout', digest }));
