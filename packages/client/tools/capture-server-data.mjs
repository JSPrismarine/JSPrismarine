/**
 * Records what a real server sends every joining client, and writes it where `bedrock-data`
 * reads it.
 *
 * Three things a server needs are not in any file a Bedrock Dedicated Server ships, or only
 * in a form that would have to be reverse engineered - they live in the server binary, or
 * are built by it from packs that are now packed. All three are, however, sent to every
 * client that logs in. So the way to get them is not to take the server apart but to ask
 * it, and this is a client that logs in and writes down the answers:
 *
 * - **The item table**, sent as `ItemRegistryPacket`: every item name and the number it
 *   travels as. Written to `required_item_list.json`.
 * - **The data driven vanilla blocks**, carried in `StartGamePacket`'s block properties.
 *   Since 1.26.50 vanilla defines some of its own blocks in data - wool stairs, concrete
 *   slabs - and a client only knows them if the server declares them. Written to
 *   `block_definitions.json`, each definition as the network NBT the server sent.
 * - **The jigsaw structure rules**, sent as `JigsawStructureDataPacket` before `StartGame`.
 *   A client at 2193 disconnects from a server that does not send them. Written to
 *   `jigsaw_structure_data.nbt`, the packet's payload as it came.
 * - **The biome definitions**, sent as `BiomeDefinitionListPacket`: a client reaches the
 *   world-generation screen with no biomes and disconnects if this is empty. Written to
 *   `biome_definitions_network.nbt`, the packet's payload as it came.
 *
 * Run it against a server of the version you want the data for:
 *
 * ```
 * node packages/client/tools/capture-server-data.mjs --host 127.0.0.1 --port 19132
 * ```
 *
 * BDS needs `online-mode=false` and `allow-list=false` to accept an offline identity, and
 * `transport=raknet` from 1.26.50 on - it defaults to NetherNet now, which this client does
 * not speak. Nothing else is required, and the world it generates is thrown away: all three
 * are sent before the player is spawned and none depends on the world.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { PacketIdentifier } from '../../protocol/dist/index.es.js';
import { Client } from '../dist/index.es.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const JSP = path.resolve(HERE, '../../bedrock-data/src/jsp');

const { values } = parseArgs({
    options: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '19132' },
        out: { type: 'string', default: JSP },
        /** What the captured files say they came from, e.g. `bedrock-server-1.26.51.1`. */
        server: { type: 'string', default: '' }
    }
});

const client = new Client({
    host: values.host,
    port: Number(values.port),
    // Sixteen characters is the longest name a server admits; one more and it disconnects
    // with a reason left blank.
    displayName: 'DataCapture',
    loginTimeoutMs: 60_000
});

// Everything the client owns is unref'ed, so without this the process exits before the login
// has had a chance to finish.
const keepalive = setInterval(() => {}, 1000);

let registry = null;
let startGame = null;
let jigsaw = null;
let biomes = null;

client.on('packet', (packet) => {
    if (packet.id === PacketIdentifier.ITEM_REGISTRY) registry = packet.data;
    if (packet.id === PacketIdentifier.START_GAME) startGame = packet.data;
});

// The jigsaw rules are one NBT compound and nothing else, so the payload is kept as it came
// rather than decoded: the client alone interprets it, and the server hands it on verbatim.
const payloadOf = (buffer) => {
    let cursor = 0;
    while ((buffer[cursor++] & 0x80) !== 0); // Step over the header varint.
    return Buffer.from(buffer.subarray(cursor));
};

client.getSession().on('raw', ({ id, buffer }) => {
    if (id === PacketIdentifier.JIGSAW_STRUCTURE_DATA) jigsaw = payloadOf(buffer);
    if (id === PacketIdentifier.BIOME_DEFINITION_LIST) biomes = payloadOf(buffer);
});

const relative = (file) => path.relative(process.cwd(), file);

try {
    await client.connect();

    if (registry === null) throw new Error('Joined, but the server never sent an item registry');
    if (startGame === null) throw new Error('Joined, but the server never sent StartGame');
    if (jigsaw === null) throw new Error('Joined, but the server never sent jigsaw structure data');
    if (biomes === null) throw new Error('Joined, but the server never sent biome definitions');

    const server = values.server || `${startGame.serverVersion} server`;
    fs.mkdirSync(values.out, { recursive: true });

    // The shape `bedrock-data` reads: name to number, and whether the client has to be told
    // how the item behaves. Sorted, so that a recapture of an unchanged table is an empty diff.
    const table = Object.fromEntries(
        [...registry.items]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => [item.name, { runtime_id: item.runtimeId, component_based: item.componentBased }])
    );
    const tableFile = path.join(values.out, 'required_item_list.json');
    fs.writeFileSync(tableFile, `${JSON.stringify(table, null, 0)}\n`);
    console.log(`Wrote ${relative(tableFile)}`);
    console.log(
        `  ${registry.items.length} items, ${registry.items.filter((i) => i.componentBased).length} component based`
    );

    const blocks = {
        $comment: [
            'The vanilla blocks a client is not born knowing, and the definitions it needs to draw',
            'them: since 1.26.50 vanilla defines some of its own blocks in data, and a server has',
            'to declare those in StartGamePacket exactly as a Bedrock Dedicated Server does.',
            'Captured from one with packages/client/tools/capture-server-data.mjs; each definition',
            'is the network NBT the server sent, base64, and is written back to the wire verbatim.'
        ],
        minecraftVersion: startGame.serverVersion,
        server,
        blocks: [...startGame.blockProperties]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((block) => ({ name: block.name, definition: block.definition.toString('base64') }))
    };
    const blocksFile = path.join(values.out, 'block_definitions.json');
    fs.writeFileSync(blocksFile, `${JSON.stringify(blocks, null, 1)}\n`);
    console.log(`Wrote ${relative(blocksFile)}`);
    console.log(
        `  ${blocks.blocks.length} data driven blocks, ${startGame.blockProperties.reduce((n, b) => n + b.definition.byteLength, 0)} bytes of definitions`
    );

    const jigsawFile = path.join(values.out, 'jigsaw_structure_data.nbt');
    fs.writeFileSync(jigsawFile, jigsaw);
    console.log(`Wrote ${relative(jigsawFile)}`);
    console.log(`  ${jigsaw.byteLength} bytes of jigsaw structure rules`);

    const biomesFile = path.join(values.out, 'biome_definitions_network.nbt');
    fs.writeFileSync(biomesFile, biomes);
    console.log(`Wrote ${relative(biomesFile)}`);
    console.log(`  ${biomes.byteLength} bytes of biome definitions`);
} catch (error) {
    console.error(`Could not capture: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    clearInterval(keepalive);
    client.disconnect();
}
