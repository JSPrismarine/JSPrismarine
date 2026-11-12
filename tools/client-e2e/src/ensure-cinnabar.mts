/** CLI: resolve, build, and version-check the pinned cinnabar checkout, then print its paths. */
import { parseArgs } from 'node:util';

import { ensureCinnabar, parseTransport } from './cinnabar.mts';

const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== '--'),
    options: { protocol: { type: 'string' }, transport: { type: 'string' } }
});
const protocolVersion = values.protocol === undefined ? undefined : Number(values.protocol);
if (protocolVersion !== undefined && (!Number.isSafeInteger(protocolVersion) || protocolVersion <= 0)) {
    throw new Error('--protocol must be a positive integer');
}

const { pin, checkout, binaries, clientBinary, target } = ensureCinnabar(
    protocolVersion,
    values.transport === undefined ? undefined : parseTransport(values.transport)
);
console.log(`cinnabar ${pin.commit.slice(0, 12)} for protocol ${pin.protocol} over ${pin.transport}`);
console.log(`cinnabar checkout: ${checkout}`);
console.log(`client: ${clientBinary}`);
console.log(`mcp server: ${binaries.mcp} --repo ${checkout}`);
console.log(`targets Bedrock ${target.gameVersion} (wire protocol ${target.wireProtocol})`);
