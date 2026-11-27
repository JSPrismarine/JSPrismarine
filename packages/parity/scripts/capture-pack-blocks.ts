/**
 * Captures the pack block golden from the pinned Bedrock Dedicated Server.
 *
 * Every pack under `scenarios/pack-blocks/` goes into one flat world of a staged server, a client
 * joins, and the `StartGamePacket.blockProperties` entry the server sends for each of their
 * blocks becomes `goldens/pack-blocks.json`, as the plain NBT `nbtToPlain` reads. Where
 * `CreativeContentPacket` files their blocks and items, and the creative keys of the items'
 * `ItemRegistryPacket` entries, become `goldens/pack-creative.json`.
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/parity run capture:pack-blocks
 * ```
 *
 * Run it when a fixture pack changes or the BDS pin moves, and commit the golden it writes. CI
 * never runs it: the comparison reads the checked-in golden.
 */
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { tsImport } from 'tsx/esm/api';

import { dumpArgs } from '../../bedrock-data/utils/bedrock-dump/cli.ts';
import { stageBehaviorPacks } from '../../bedrock-data/utils/bedrock-dump/pack.ts';
import { spawnProbe } from '../../bedrock-data/utils/bedrock-dump/probe.ts';
import { launcherForHost } from '../../bedrock-data/utils/bedrock-dump/runner.ts';
import { READY_LINE, SERVER_BINARY, stageServer, startServer } from '../../bedrock-data/utils/bedrock-dump/server.ts';
import { bedrockServerPath } from '../../bedrock-data/utils/fetch/bds.ts';
import { loadBdsData, selectBdsVersion } from '../../bedrock-data/utils/fetch/manifest.ts';
import { cacheRoot, packageDir as bedrockDataDirectory } from '../../bedrock-data/utils/fetch/paths.ts';
import {
    PACK_BLOCK_NAMESPACE,
    PACK_BLOCKS_GOLDEN,
    packBlockFixtures,
    renderPackBlocksGolden
} from '../src/packBlocks.ts';
import type { PackBlocksGolden } from '../src/packBlocks.ts';
import { PACK_CREATIVE_GOLDEN, creativeItemPropertiesOf, renderPackCreativeGolden } from '../src/packCreative.ts';
import type {
    CompoundReader,
    PackCreativeEntry,
    PackCreativeGolden,
    PackCreativeItemProperties
} from '../src/packCreative.ts';

/** How long each stage may take on a native run. The launcher stretches them for emulation. */
const NATIVE_TIMEOUTS = { boot: 180_000, join: 120_000, stop: 120_000 };

/** A flat world, on ports clear of a server already listening on the default ones. */
const PROPERTIES = { 'level-type': 'FLAT', 'server-port': '29162', 'server-portv6': '29163' };

const { values } = parseArgs({
    args: dumpArgs(process.argv.slice(2)),
    options: { force: { type: 'boolean', default: false } }
});

const { protocolVersion, version: pinnedServer } = selectBdsVersion(
    await loadBdsData(join(bedrockDataDirectory, 'sources.json'))
);
const unpacked = await bedrockServerPath(protocolVersion);
if (!existsSync(join(unpacked, SERVER_BINARY))) {
    throw new Error(
        `${unpacked} holds no ${SERVER_BINARY}. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first.`
    );
}

const launcher = launcherForHost(spawnProbe);
console.log(`Running ${launcher.description}`);
launcher.ensureImage();

const fixtures = packBlockFixtures();
const staged = await stageServer({
    unpacked,
    root: join(cacheRoot, 'bds-run', `v${protocolVersion}-pack-blocks`),
    force: values.force,
    levelName: 'jsp-pack-blocks',
    properties: PROPERTIES
});
await stageBehaviorPacks(
    staged.root,
    staged.worldDirectory,
    fixtures.packs.map((pack) => ({
        uuid: pack.uuid,
        version: pack.version,
        source: pack.directory,
        directory: pack.name
    }))
);

const server = startServer({
    ...launcher.launch(staged.root, { clientConnects: true, serverPort: Number(PROPERTIES['server-port']) }),
    cwd: staged.root,
    onLine: (line) => console.log(`  ${line}`)
});

let blocks: PackBlocksGolden['blocks'] = {};
let creative: Omit<PackCreativeGolden, '$comment' | 'server'> | undefined;
try {
    await server.waitForLine(
        (line) => line.includes(READY_LINE),
        'the ready line',
        NATIVE_TIMEOUTS.boot * launcher.timeoutScale
    );

    // tsImport returns an untyped namespace; the client and protocol sources declare these exports.
    const packages = join(import.meta.dirname, '..', '..');
    const { Client } = await tsImport(join(packages, 'client', 'src', 'index.ts'), import.meta.url);
    const nbt = await tsImport(join(packages, 'protocol', 'src', 'bedrock', 'payload', 'nbt.ts'), import.meta.url);
    const client = new Client({
        host: '127.0.0.1',
        port: Number(PROPERTIES['server-port']),
        displayName: 'PackBlocks',
        loginTimeoutMs: NATIVE_TIMEOUTS.join * launcher.timeoutScale,
        network: staged.transport,
        protocolVersion
    });
    // The client decodes only the packets its login needs, so the creative menu is registered here.
    const { default: CreativeContentPacket } = await tsImport(
        join(packages, 'protocol', 'src', 'bedrock', 'packet', 'CreativeContentPacket.ts'),
        import.meta.url
    );
    client.getRegistry().register(CreativeContentPacket);

    interface Stack {
        runtimeId: number;
        blockRuntimeId: number;
    }
    interface Menu {
        groups: { category: number; name: string; icon: Stack }[];
        entries: { item: Stack; group: number }[];
    }
    const received: { menu?: Menu } = {};
    const names = new Map<number, string>();
    const items: Record<string, PackCreativeItemProperties> = {};
    client.on('packet', ({ name, data }: { name: string; data: any }) => {
        if (name === 'CreativeContentPacket') received.menu = data;
        if (name !== 'ItemRegistryPacket') return;
        for (const item of data.items as { name: string; runtimeId: number; componentData: CompoundReader }[]) {
            names.set(item.runtimeId, item.name);
            if (!item.name.startsWith(`${PACK_BLOCK_NAMESPACE}:`)) continue;
            const properties = creativeItemPropertiesOf(item.componentData);
            if (properties !== undefined) items[item.name] = properties;
        }
    });

    const startGame = await client.connect();
    // The menu follows the spawn, so the client stays until it has arrived.
    const deadline = Date.now() + NATIVE_TIMEOUTS.join * launcher.timeoutScale;
    while (received.menu === undefined && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    client.disconnect();
    const { menu } = received;
    if (menu === undefined) throw new Error('The server sent no CreativeContentPacket.');

    const entries: Record<string, PackCreativeEntry> = {};
    for (const entry of menu.entries) {
        const name = names.get(entry.item.runtimeId);
        if (name === undefined || !name.startsWith(`${PACK_BLOCK_NAMESPACE}:`)) continue;
        if (name in entries) throw new Error(`The menu lists ${name} twice.`);
        entries[name] = { group: entry.group, blockRuntimeId: entry.item.blockRuntimeId };
    }
    creative = {
        groups: menu.groups.map((group) => ({
            category: group.category,
            name: group.name,
            icon: names.get(group.icon.runtimeId) ?? ''
        })),
        entries,
        items
    };

    const captured: Record<string, unknown> = {};
    for (const property of startGame.blockProperties ?? []) {
        if (!property.name.startsWith(`${PACK_BLOCK_NAMESPACE}:`)) continue;
        captured[property.name] = nbt.nbtToPlain(nbt.readNetworkNbt(property.definition));
    }
    blocks = captured;
} finally {
    await server.stop(NATIVE_TIMEOUTS.stop * launcher.timeoutScale);
    launcher.cleanup();
}

const missing = fixtures.blocks.filter((block) => !(block.identifier in blocks)).map((block) => block.identifier);
if (missing.length > 0) throw new Error(`The server sent no definition for ${missing.join(', ')}.`);

await writeFile(
    PACK_BLOCKS_GOLDEN,
    renderPackBlocksGolden({
        $comment: [
            'What the pinned Bedrock Dedicated Server sends as StartGamePacket.blockProperties for the blocks of',
            'scenarios/pack-blocks/, as nbtToPlain reads each definition.',
            'Written by `pnpm --filter @jsprismarine/parity run capture:pack-blocks`; never edit by hand.'
        ],
        server: { protocolVersion, serverVersion: pinnedServer.serverVersion },
        blocks
    })
);
console.log(`Wrote ${PACK_BLOCKS_GOLDEN}: ${Object.keys(blocks).length} blocks.`);

if (creative === undefined) throw new Error('No creative menu was captured.');
await writeFile(
    PACK_CREATIVE_GOLDEN,
    renderPackCreativeGolden({
        $comment: [
            'Where the pinned Bedrock Dedicated Server files the blocks and items of scenarios/pack-blocks/ in',
            'CreativeContentPacket, and the creative keys of their ItemRegistryPacket entries. An entry names',
            'its heading by its index in groups, the whole heading list in packet order.',
            'Written by `pnpm --filter @jsprismarine/parity run capture:pack-blocks`; never edit by hand.'
        ],
        server: { protocolVersion, serverVersion: pinnedServer.serverVersion },
        ...creative
    })
);
console.log(`Wrote ${PACK_CREATIVE_GOLDEN}: ${Object.keys(creative.entries).length} entries.`);
