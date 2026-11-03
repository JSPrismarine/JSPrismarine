import { performance } from 'node:perf_hooks';
import dgram from 'node:dgram';

const datagramCount = Number(process.env.RAKNET_BENCH_DATAGRAMS ?? 10_000);
const datagram = Buffer.alloc(64, 0x5a);
const sizes = [64 * 1024, 256 * 1024, 1024 * 1024, 4 * 1024 * 1024];

for (const size of sizes) {
    const socket = dgram.createSocket('udp4');
    let received = 0;
    socket.on('message', () => received++);

    await new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, '127.0.0.1', resolve);
    });

    socket.setRecvBufferSize(size);
    socket.setSendBufferSize(size);
    const effectiveRecvBufferSize = socket.getRecvBufferSize();
    const effectiveSendBufferSize = socket.getSendBufferSize();
    const port = socket.address().port;
    let sent = 0;
    const started = performance.now();

    await new Promise((resolve, reject) => {
        for (let index = 0; index < datagramCount; index++) {
            socket.send(datagram, port, '127.0.0.1', (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                sent++;
                if (sent === datagramCount) resolve();
            });
        }
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const elapsedMs = performance.now() - started;
    console.log(
        JSON.stringify({
            requestedBufferSize: size,
            effectiveRecvBufferSize,
            effectiveSendBufferSize,
            sent,
            received,
            elapsedMs: Number(elapsedMs.toFixed(2))
        })
    );

    await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())));
}
