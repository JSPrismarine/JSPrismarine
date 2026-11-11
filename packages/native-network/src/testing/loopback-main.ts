/**
 * Runs one loopback exchange and prints its result as JSON, so a test can run it under another
 * runtime, such as Bun.
 */
import { NativeNetwork } from '../NativeNetwork';
import { runLoopback } from './loopback';

const port = Number(process.argv[2] ?? 0);
const network = await NativeNetwork.load();
const result = await runLoopback(
    network,
    port > 0 ? { enableIceUdpMux: true, portRangeBegin: port, portRangeEnd: port } : {}
);
process.stdout.write(
    `${JSON.stringify({ ...result, runtime: process.versions.bun === undefined ? 'node' : 'bun' })}\n`
);
network.close();
