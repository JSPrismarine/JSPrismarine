/** CLI: resolve, build, and version-check the pinned cinnabar checkout, then print its paths. */
import { ensureCinnabar } from './cinnabar.mts';

const { checkout, binaries, target } = ensureCinnabar();
console.log(`cinnabar checkout: ${checkout}`);
console.log(`client: ${binaries.client}`);
console.log(`mcp server: ${binaries.mcp} --repo ${checkout}`);
console.log(`targets Bedrock ${target.gameVersion} (wire protocol ${target.wireProtocol})`);
