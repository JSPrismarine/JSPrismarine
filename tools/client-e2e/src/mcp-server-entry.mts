/**
 * Entry point for `.mcp.json`: runs the pinned checkout's cinnabar-mcp binary over stdio.
 *
 * Fails fast with build instructions instead of building, so registering the MCP server never
 * blocks a session behind a long compile.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

import { binaries, checkoutDir, readPin } from './cinnabar.mts';

const checkout = checkoutDir(readPin());
const mcp = binaries(checkout).mcp;
if (!fs.existsSync(mcp)) {
    console.error(`${mcp} is not built. Run: pnpm --filter @jsprismarine/client-e2e run ensure`);
    process.exit(1);
}

const child = spawn(mcp, ['--repo', checkout], { cwd: checkout, stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
