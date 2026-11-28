/**
 * Drives a client through every exchange scenario against a running Bedrock Dedicated Server and
 * writes what the server sent, one file a scenario
 * ([the verification plan](../../../docs/plans/bedrock-version-verification.md)).
 *
 * `dump:bedrock --pass exchanges` stages and boots the pinned server for a protocol and runs this
 * with an IPC channel: a scenario's console command goes to the pass as a `command` message, which
 * types it at the server's console and answers once the server has answered it.
 *
 * ```
 * pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass exchanges --protocol 2225
 * ```
 */
import { ClientErrors } from '@jsprismarine/errors/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import Client from '../src/Client.ts';
import ClientWorld from '../src/ClientWorld.ts';
import type { ExchangeCapture, ExchangeDriver } from '../src/exchanges/exchange.ts';
import { runExchange } from '../src/exchanges/exchange.ts';
import { EXCHANGE_SCENARIOS, EXCHANGE_SETUP } from '../src/exchanges/scenarios.ts';
import { playerAuthInput } from '../src/playerAuthInput.ts';

const { values } = parseArgs({
    options: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '19132' },
        /** The transport the server accepts clients over: `raknet` or `nethernet`. */
        network: { type: 'string', default: 'raknet' },
        /** The protocol to log in with, which has to be the server's own. */
        protocol: { type: 'string' },
        /** The server build, as the capture files record it, such as `1.26.60.6`. */
        server: { type: 'string' },
        /** The directory the captures go in, `src/jsp/v<protocol>/exchanges`. */
        out: { type: 'string' },
        /** Only the scenarios named, comma separated; `JSP_EXCHANGES`, or every one, by default. */
        only: { type: 'string', default: process.env['JSP_EXCHANGES'] ?? '' }
    }
});

if (values.protocol === undefined || values.server === undefined || values.out === undefined) {
    throw new Error('capture-exchanges needs --protocol, --server and --out');
}
const protocolVersion = Number(values.protocol);
const out = values.out;
const serverVersion = values.server;

/** The server's tick, which a wait counts in. */
const TICK_MS = 50;

/** How long `until` waits before it gives up. */
const UNTIL_TICKS = 600;

/** The name the capture's player joins under, which a scenario's command names it by. */
const NAME = 'ExchangeCapture';

/** Asks the pass to type `line` at the console, and resolves once the server answered it. */
const command = (() => {
    let next = 0;
    const waiting = new Map<number, () => void>();
    process.on('message', (message: unknown) => {
        if (typeof message !== 'object' || message === null || !('answered' in message)) return;
        const id = Number(message.answered);
        waiting.get(id)?.();
        waiting.delete(id);
    });
    return (line: string): Promise<void> =>
        new Promise((resolve) => {
            if (process.send === undefined) throw new Error('capture-exchanges has to run with an IPC channel');
            const id = next++;
            waiting.set(id, resolve);
            process.send({ command: line, id });
        });
})();

const client = new Client({
    host: values.host,
    port: Number(values.port),
    displayName: NAME,
    loginTimeoutMs: 120_000,
    network: values.network === 'nethernet' ? 'nethernet' : 'raknet',
    protocolVersion
});
const world = new ClientWorld(client);

let inputTick = 0n;
let teleportsHandled = 0;

/** One `PlayerAuthInput` from where the client stands, saying it handled any teleport since the last. */
const input = async (): Promise<void> => {
    const at = world.getPosition();
    if (at === undefined) return;
    const handledTeleport = world.getTeleportCount() > teleportsHandled;
    teleportsHandled = world.getTeleportCount();
    inputTick += 1n;
    await client
        .getSession()
        .send(playerAuthInput({ position: at, pitch: 0, yaw: 0, headYaw: 0 }, { tick: inputTick, handledTeleport }));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const wait = async (ticks: number): Promise<void> => {
    for (let tick = 0; tick < ticks; tick++) {
        await input();
        await sleep(TICK_MS);
    }
};

const driver: ExchangeDriver = {
    client,
    world,
    name: NAME,
    command,
    wait,
    until: async (condition, what) => {
        for (let tick = 0; !condition(); tick++) {
            if (tick > UNTIL_TICKS) throw new ClientErrors.ExchangeNeverHappened({ what, ticks: String(UNTIL_TICKS) });
            await wait(1);
        }
    },
    record: () => {}
};

const only = new Set(values.only.split(',').filter((name) => name !== ''));

if (process.env['JSP_EXCHANGE_TRACE'] === '1') {
    const noisy = new Set([
        'MoveActorDeltaPacket',
        'SetActorMotionPacket',
        'LevelChunkPacket',
        'NetworkChunkPublisherUpdatePacket',
        'SetTimePacket',
        'MovePlayerPacket',
        'UpdateAttributesPacket',
        'SetActorDataPacket',
        'MoveActorAbsolutePacket',
        'NetworkStackLatencyPacket'
    ]);
    client.on('packet', (decoded: { name: string }) => {
        if (!noisy.has(decoded.name)) console.log(`    <- ${decoded.name}`);
    });
}
for (const line of EXCHANGE_SETUP) await command(line);
await client.connect();
await driver.until(() => world.getPosition() !== undefined, 'the client was never placed');
// Settled into the world before the first scenario, as a player who just joined is.
await wait(40);

await mkdir(out, { recursive: true });
for (const scenario of EXCHANGE_SCENARIOS) {
    if (only.size > 0 && !only.has(scenario.id)) continue;
    console.log(`  exchange ${scenario.id}`);
    const packets = await runExchange(scenario, driver);
    const capture: ExchangeCapture = { scenario: scenario.id, protocolVersion, server: serverVersion, packets };
    await writeFile(path.join(out, `${scenario.id}.json`), `${JSON.stringify(capture, null, 4)}\n`);
    console.log(`  exchange ${scenario.id}: ${packets.length} packets`);
}

client.disconnect('capture finished');
process.exit(0);
