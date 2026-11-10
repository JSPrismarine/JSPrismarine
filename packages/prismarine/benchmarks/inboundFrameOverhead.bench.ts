import { performance } from 'node:perf_hooks';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import { InetAddress, Protocol } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import { EventEmitter } from '../src/events/EventEmitter';
import { ConnectionIds } from '../src/network/transport/ConnectionId';
import RakNetTransport from '../src/network/transport/RakNetTransport';
import type { RakNetTransportSource } from '../src/network/transport/RakNetTransport';
import { stub } from '../src/testing/stub.test.helper';

class BenchSource extends NodeEventEmitter implements RakNetTransportSource {
    public sendBuffer(): void {}
    public kill(): void {}
}

const frameCount = Number(process.env.JSP_INBOUND_FRAME_BENCH_COUNT ?? 20_000);
const address = new InetAddress('127.0.0.1', 19132);
const frame = new Protocol.Frame();
frame.content = Buffer.from([0xfe, 0x00]);

const run = async (withPluginListener: boolean): Promise<void> => {
    const source = new BenchSource();
    const events = new EventEmitter();
    if (withPluginListener) events.on('raknetEncapsulatedPacket', () => {});

    const transport = new RakNetTransport(source, events, new ConnectionIds());
    let delivered = 0;
    let finish = () => {};
    const complete = new Promise<void>((resolve) => {
        finish = resolve;
    });
    transport.onFrame(() => {
        delivered++;
        if (delivered === frameCount) finish();
    });

    // Frames only reach listeners from a session the transport has accepted.
    const connected = new Promise<void>((resolve) => transport.onConnect(() => resolve()));
    source.emit('openConnection', stub<RakNetSession>({ getAddress: () => address }));
    await connected;

    const started = performance.now();
    for (let index = 0; index < frameCount; index++) source.emit('encapsulated', frame, address);
    await complete;

    const elapsedMs = performance.now() - started;
    console.log(
        JSON.stringify({
            pluginListeners: withPluginListener ? 1 : 0,
            frames: delivered,
            microsecondsPerFrame: Number(((elapsedMs * 1000) / delivered).toFixed(3))
        })
    );
};

await run(false);
await run(true);
