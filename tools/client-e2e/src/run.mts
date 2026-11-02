/**
 * The e2e runner: builds the pinned client if needed, boots a scratch JSPrismarine server,
 * joins it with a headless cinnabar client, and runs the requested scenarios against the pair.
 *
 * ```
 * pnpm --filter @jsprismarine/client-e2e run e2e            # every scenario
 * pnpm --filter @jsprismarine/client-e2e run e2e movement   # a selection
 * pnpm --filter @jsprismarine/client-e2e run e2e --record   # also record the whole run
 * ```
 *
 * Evidence lands in `--artifacts` (default: a fresh temporary directory, printed at the end).
 * Exits 0 only when the join and every selected scenario pass.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ensureCinnabar } from './cinnabar.mts';
import { CinnabarClient } from './client.mts';
import { startServer } from './jsp-server.mts';
import type { Scenario } from './scenario.mts';
import { chat } from './scenarios/chat.mts';
import { movement } from './scenarios/movement.mts';
import { spawn } from './scenarios/spawn.mts';
import { teleport } from './scenarios/teleport.mts';

const scenarios: Scenario[] = [spawn, movement, chat, teleport];

// pnpm forwards the literal `--` separators it was given; drop them so flags stay flags.
const argv = process.argv.slice(2).filter((argument) => argument !== '--');

const { values, positionals } = parseArgs({
    args: argv,
    options: {
        record: { type: 'boolean', default: false },
        artifacts: { type: 'string' },
        port: { type: 'string' }
    },
    allowPositionals: true
});

const selected = positionals.length
    ? positionals.map((name) => {
          const scenario = scenarios.find((candidate) => candidate.name === name);
          if (!scenario) {
              console.error(`unknown scenario '${name}'; available: ${scenarios.map((s) => s.name).join(', ')}`);
              process.exit(2);
          }
          return scenario;
      })
    : scenarios;

const artifacts = path.resolve(values.artifacts ?? fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-e2e-')));
fs.mkdirSync(artifacts, { recursive: true });
const playerName = 'jsp-e2e';

console.log('ensuring the pinned cinnabar build (the first run clones and compiles it)...');
const cinnabar = ensureCinnabar();
console.log(`client targets Bedrock ${cinnabar.target.gameVersion} (protocol ${cinnabar.target.wireProtocol})`);

console.log('booting a scratch JSPrismarine server...');
const server = await startServer({ port: values.port ? Number(values.port) : undefined });
console.log(`server listening on 127.0.0.1:${server.port}, data in ${server.dir}`);

let failures = 0;
const client = await CinnabarClient.start(cinnabar.checkout, cinnabar.binaries.mcp);
try {
    console.log('launching the headless client...');
    await client.launch({ userRoot: path.join(server.dir, 'client-user-root'), displayName: playerName });

    if (values.record) await client.recordStart(path.join(artifacts, 'run.mp4'));

    console.log('joining...');
    const joined = server.waitForLine(new RegExp(`${playerName} joined the game`), 120_000);
    await client.connect(server.port);
    await client.waitFor('in_world', 120_000);
    await client.waitForScreenAbsent('Loading', 120_000);
    await joined;
    console.log('join: ok (client in world past the loading screen, server saw the player join)');

    for (const scenario of selected) {
        const dir = path.join(artifacts, scenario.name);
        fs.mkdirSync(dir, { recursive: true });
        try {
            await scenario.run({
                server,
                client,
                playerName,
                artifacts: dir,
                log: (message) => console.log(`${scenario.name}: ${message}`)
            });
            console.log(`${scenario.name}: ok (${scenario.description})`);
        } catch (error) {
            failures += 1;
            console.error(`${scenario.name}: FAILED`);
            console.error(error);
            await client.screenshot(path.join(dir, 'failure.png')).catch(() => {});
        }
    }

    if (values.record) {
        const recording = await client.recordStop();
        console.log(`recording: ${String(recording.path)} (${String(recording.frames)} frames)`);
    }
} catch (error) {
    failures += 1;
    console.error('run failed before scenarios completed:');
    console.error(error);
} finally {
    await client.close().catch(() => {});
    await server.stop().catch(() => {});
}

fs.writeFileSync(path.join(artifacts, 'server.log'), `${server.lines.join('\n')}\n`);
console.log(`artifacts: ${artifacts}`);
console.log(failures === 0 ? 'e2e: all scenarios passed' : `e2e: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
