import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import ServerSocket from '../src/ServerSocket';
import WorkerServerSocket from '../src/WorkerServerSocket';
import { ServerName } from '../src/utils/ServerName';

const BOT_COUNT = Number(process.env.JSP_RAKNET_BENCH_BOTS ?? 24);
const DURATION_MS = Number(process.env.JSP_RAKNET_BENCH_DURATION_MS ?? 5000);
const SEED = 0x4a535052;

const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {},
    debug: () => {},
    silly: () => {}
};

const makeServerName = () =>
    new ServerName(
        {
            getConfig: () => ({
                getMotd: () => 'RakNet worker benchmark',
                getGamemode: () => 'survival',
                getMaxPlayers: () => BOT_COUNT
            })
        },
        { protocolVersion: 2225, minecraftVersions: ['1.26.60'] }
    );

const cpuMs = (usage: NodeJS.CpuUsage): number => (usage.user + usage.system) / 1000;

const run = async (useWorker: boolean) => {
    const serverName = makeServerName();
    const worker = useWorker ? new WorkerServerSocket(BOT_COUNT, false, serverName, logger) : undefined;
    const server = worker ?? new ServerSocket(BOT_COUNT, false, serverName, logger);
    let inboundFrames = 0;
    server.on('encapsulated', () => {
        inboundFrames++;
    });

    if (worker) {
        worker.start('127.0.0.1', 0);
        await worker.waitUntilReady();
    } else {
        const listening = once(server, 'listening');
        server.start('127.0.0.1', 0);
        await listening;
    }

    const botFleet = new Worker(new URL('./workerTransportBotFleet.ts', import.meta.url), {
        workerData: { bots: BOT_COUNT, port: serverName.getPort(), seed: SEED },
        execArgv: process.execArgv
    });
    await Promise.race([
        once(botFleet, 'message'),
        once(botFleet, 'error').then(([error]) => {
            throw error;
        })
    ]);

    const gameTick = worker ? setInterval(() => worker.pollInbound(), 50) : undefined;
    const connectionDeadline = performance.now() + 5000;
    while (server.getSessions().length < BOT_COUNT) {
        if (performance.now() >= connectionDeadline) throw new Error('bot fleet did not connect before the benchmark');
        worker?.pollInbound();
        await delay(2);
    }

    const mainCpuBefore = process.threadCpuUsage();
    const networkCpuBefore = worker ? await worker.getWorkerCpuUsage() : { user: 0, system: 0 };
    const botsCpuBefore = await botFleet.cpuUsage();
    const startedAt = performance.now();
    await delay(DURATION_MS);
    const elapsedMs = performance.now() - startedAt;
    const mainCpu = process.threadCpuUsage(mainCpuBefore);
    const networkCpuAfter = worker ? await worker.getWorkerCpuUsage() : { user: 0, system: 0 };
    const botsCpu = await botFleet.cpuUsage(botsCpuBefore);

    if (gameTick) clearInterval(gameTick);
    worker?.pollInbound();
    botFleet.postMessage('stop');
    await once(botFleet, 'exit');
    server.kill();

    return {
        mode: useWorker ? 'worker' : 'socket',
        bots: BOT_COUNT,
        seed: SEED,
        elapsedMs: Number(elapsedMs.toFixed(1)),
        inboundFrames,
        mainThreadCpuMs: Number(cpuMs(mainCpu).toFixed(1)),
        networkWorkerCpuMs: Number(
            cpuMs({
                user: networkCpuAfter.user - networkCpuBefore.user,
                system: networkCpuAfter.system - networkCpuBefore.system
            }).toFixed(1)
        ),
        botFleetCpuMs: Number(cpuMs(botsCpu).toFixed(1)),
        maxInboundQueueBytes: worker ? worker.getMetrics().inbound.highWatermarkBytes : 0
    };
};

for (const useWorker of [false, true]) {
    console.log(JSON.stringify(await run(useWorker)));
}
