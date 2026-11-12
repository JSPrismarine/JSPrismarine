/**
 * Measures fixed tick-debt recovery and observes loopback UDP callbacks between catch-up ticks.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:ticker`.
 */
import { createSocket } from 'node:dgram';
import type { Socket as DatagramSocket } from 'node:dgram';
import type { AddressInfo } from 'node:net';

import { ServerTicker } from '../src/modules/ticker';
import type { TickerServer } from '../src/modules/ticker';
import { ChunkCompletionQueue } from '../src/world/ChunkCompletionQueue';

const TICK_MS = 50;
const DEBT_CASES_MS = [250, 1_000] as const;

const listen = (socket: DatagramSocket): Promise<void> =>
    new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, '127.0.0.1', () => {
            socket.off('error', reject);
            resolve();
        });
    });

const close = (socket: DatagramSocket): Promise<void> => new Promise((resolve) => socket.close(() => resolve()));

const recoverDebt = async (debtMs: number) => {
    const receiver = createSocket('udp4');
    const sender = createSocket('udp4');
    await Promise.all([listen(receiver), listen(sender)]);
    const address: AddressInfo = receiver.address();

    let receivedPackets = 0;
    let activeTick = -1;
    let completedTick = -1;
    let ioCallbacksBetweenTicks = 0;
    receiver.on('message', () => {
        receivedPackets += 1;
        if (activeTick === completedTick) ioCallbacksBetweenTicks += 1;
    });

    const recoveryTick = Math.ceil(debtMs / TICK_MS);
    const tickIds: number[] = [];
    let ticker!: ServerTicker;
    let finish!: (result: { readonly elapsedMs: number; readonly tickCount: number }) => void;
    const recovered = new Promise<{ readonly elapsedMs: number; readonly tickCount: number }>((resolve) => {
        finish = resolve;
    });
    let startedAt = 0;

    const server: TickerServer = {
        emitTick: (event) => {
            activeTick = event.getTick();
            tickIds.push(activeTick);
            // A tick runs in one call, so a slow one holds the thread for its whole length.
            if (activeTick === 0) {
                const until = performance.now() + debtMs;
                while (performance.now() < until) {
                    // The debt: nothing else runs while the tick does.
                }
            }
            completedTick = activeTick;
            if (activeTick < recoveryTick) {
                for (let index = 0; index < 32; index += 1) {
                    sender.send(Buffer.from([activeTick & 0xff, index]), address.port, '127.0.0.1');
                }
            }
            if (activeTick >= recoveryTick) {
                ticker.stop();
                finish({ elapsedMs: performance.now() - startedAt, tickCount: tickIds.length });
            }
        },
        admitInputs: () => 0,
        pollNetwork: () => 0,
        getWorlds: () => [],
        getChunkCompletionQueue: () => new ChunkCompletionQueue(),
        tickFunctions: () => 0,
        getChunkScheduler: () => ({ setBudget: () => {}, tick: async () => {} }),
        getChunkSendBudgetMs: () => 0,
        isTickingEnabled: () => true,
        isProcessTitleEnabled: () => false,
        isHeadless: () => true,
        isStopping: () => false,
        getProfileOwner: () => server,
        getLogger: () => ({ warn: () => {}, verbose: () => {}, error: () => {} })
    };
    ticker = new ServerTicker(server);
    startedAt = performance.now();
    ticker.start();

    let watchdog: NodeJS.Timeout | undefined;
    try {
        const result = await Promise.race([
            recovered,
            new Promise<never>((_resolve, reject) => {
                watchdog = setTimeout(
                    () => reject(new Error(`ticker did not recover from ${debtMs} ms of debt`)),
                    debtMs + 5_000
                );
            })
        ]);
        return {
            debtMs,
            ...result,
            ioCallbacksBetweenTicks,
            receivedPackets,
            tickIds
        };
    } finally {
        clearTimeout(watchdog);
        ticker.stop();
        await Promise.all([close(receiver), close(sender)]);
    }
};

for (const debtMs of DEBT_CASES_MS) {
    const result = await recoverDebt(debtMs);
    const { tickIds: _tickIds, ...summary } = result;
    console.log(JSON.stringify(summary));
    if (result.ioCallbacksBetweenTicks === 0) {
        throw new Error(`no UDP callback ran between catch-up ticks for ${debtMs} ms of debt`);
    }
}

console.log(`platform: ${process.platform} ${process.arch}`);
console.log(`node: ${process.version}`);
