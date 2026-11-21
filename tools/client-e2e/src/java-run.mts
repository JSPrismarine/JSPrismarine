/**
 * Runs the Java Edition client scenarios: a scratch server with `java-enabled` on, and the real
 * pinned client driven headless through HeadlessMC.
 *
 * `pnpm run e2e:java [scenario...]` runs the named scenarios, or all of them.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { javaServerCacheFolder } from '../../../packages/bedrock-data/src/sources.ts';
import type { JavaClient } from './headlessmc.mts';
import { launchJavaClient } from './headlessmc.mts';
import type { JspServer } from './jsp-server.mts';
import { startServer } from './jsp-server.mts';
import { blocks } from './java-scenarios/blocks.mts';
import { chat } from './java-scenarios/chat.mts';
import { entities } from './java-scenarios/entities.mts';
import { equipment } from './java-scenarios/equipment.mts';
import { inventory } from './java-scenarios/inventory.mts';
import { join } from './java-scenarios/join.mts';
import { mining } from './java-scenarios/mining.mts';
import { placing } from './java-scenarios/placing.mts';
import { respawn } from './java-scenarios/respawn.mts';

/** What a Java scenario is given: the server, its Java port and the client, connected to nothing yet. */
export interface JavaScenarioContext {
    readonly server: JspServer;
    readonly client: JavaClient;
    readonly javaPort: number;
}

/** One Java Edition scenario. */
export interface JavaScenario {
    readonly name: string;
    run(context: JavaScenarioContext): Promise<void>;
}

const SCENARIOS: readonly JavaScenario[] = [
    join,
    chat,
    entities,
    equipment,
    blocks,
    mining,
    inventory,
    placing,
    respawn
];

/** A TCP port nothing listens on. */
const freeTcpPort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer().once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const address = probe.address();
            probe.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0));
        });
    });

const { positionals } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true
});
const chosen =
    positionals.length === 0 ? SCENARIOS : SCENARIOS.filter((scenario) => positionals.includes(scenario.name));
if (chosen.length === 0) throw new Error(`no Java scenario named ${positionals.join(', ')}`);

let failed = 0;
for (const scenario of chosen) {
    const javaPort = await freeTcpPort();
    let server: JspServer;
    try {
        server = await startServer({ javaPort });
    } catch (error) {
        failed += 1;
        console.log(`FAIL ${scenario.name}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
    }
    let client: JavaClient | undefined;
    // Outside the server's directory, which its stop deletes.
    const clientLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-e2e-java-')), 'java-client.log');
    try {
        // The release the server's Java data and its Java protocol are pinned to.
        client = await launchJavaClient(javaServerCacheFolder, (line) => fs.appendFileSync(clientLog, `${line}\n`));
        await scenario.run({ server, client, javaPort });
        console.log(`PASS ${scenario.name}`);
    } catch (error) {
        failed += 1;
        console.log(`FAIL ${scenario.name}: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`  the client's output: ${clientLog}`);
        console.log(`  the server's last lines:\n${server.lines.slice(-25).join('\n')}`);
    } finally {
        await client?.stop();
        await server.stop();
    }
}
process.exitCode = failed === 0 ? 0 : 1;
