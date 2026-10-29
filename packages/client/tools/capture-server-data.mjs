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
 *   `jigsaw_structure_data.nbt`, the payload with its four registries sorted by identifier;
 *   see `sortedJigsawRegistries` for why it is not kept exactly as it came.
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
 * The four files land in `packages/bedrock-data/src/jsp/v<protocol>/`, one directory per
 * Bedrock protocol version. Without `--out` that is the version `sources.json` names as the
 * default, which is only right if the server you pointed it at is that version; `dump:bedrock`
 * passes `--out` for the version it staged.
 *
 * `--extended <dir>` additionally writes the raw payload of the engine tables this repository
 * has no decoder for yet - the recipe list, the creative menu, the command tree, the actor
 * identifiers, the collision shapes, the armor trims and the camera presets. Those files are
 * the fixtures a decoder is written against, in the way `StartGamePacket.test.ts` is written
 * against a captured `StartGamePacket`, so the capture does not have to wait for the decoder.
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

import BinaryStream from '../../binaryutils/dist/index.es.js';
import { ByteOrder, NBTReader, NBTWriter } from '../../nbt/dist/index.es.js';
import { PacketIdentifier } from '../../protocol/dist/index.es.js';
import { Client } from '../dist/index.es.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BEDROCK_DATA = path.resolve(HERE, '../../bedrock-data');

/**
 * The captures live under one directory per Bedrock protocol version. `dump:bedrock` passes
 * `--out` for the version it is capturing; run by hand, this writes the default version's.
 */
const defaultProtocolVersion = JSON.parse(fs.readFileSync(path.join(BEDROCK_DATA, 'sources.json'), 'utf8')).bds
    .defaultProtocolVersion;
const JSP = path.join(BEDROCK_DATA, 'src/jsp', `v${defaultProtocolVersion}`);

const { values } = parseArgs({
    options: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '19132' },
        out: { type: 'string', default: JSP },
        /** Where the raw engine table payloads go. Empty means do not record them. */
        extended: { type: 'string', default: '' },
        /** What the captured files say they came from, e.g. `bedrock-server-1.26.51.1`. */
        server: { type: 'string', default: '' },
        /**
         * Which protocol to log in with. A server admits its own version and no other, so
         * this has to match the server being captured; `dump:bedrock` passes the version it
         * staged. Defaults to the client's own.
         */
        protocol: { type: 'string', default: '' }
    }
});

/**
 * The engine tables the extended capture keeps as raw payloads, by packet identifier.
 *
 * Each is something only a running server produces: the recipe registry with its net ids, the
 * creative menu, the command grammar, the numeric entity ids, the collision shapes. Keeping
 * the bytes rather than a decode means a later decoder has a fixture to be tested against.
 */
const EXTENDED_PACKETS = new Map([
    [PacketIdentifier.CRAFTING_DATA, 'crafting_data'],
    [PacketIdentifier.CREATIVE_CONTENT, 'creative_content'],
    [PacketIdentifier.AVAILABLE_COMMANDS, 'available_commands'],
    [PacketIdentifier.AVAILABLE_ACTOR_IDENTIFIERS, 'available_actor_identifiers'],
    [PacketIdentifier.VOXEL_SHAPES, 'voxel_shapes'],
    [PacketIdentifier.TRIM_DATA, 'trim_data'],
    [PacketIdentifier.CAMERA_PRESETS, 'camera_presets']
]);

const client = new Client({
    host: values.host,
    port: Number(values.port),
    // Sixteen characters is the longest name a server admits; one more and it disconnects
    // with a reason left blank.
    displayName: 'DataCapture',
    loginTimeoutMs: 60_000,
    ...(values.protocol === '' ? {} : { protocolVersion: Number(values.protocol) })
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

/**
 * The jigsaw payload with each of its four registries in identifier order.
 *
 * The engine writes `template_pools` out of an unordered container, so two captures of one
 * server carry the same pools in a different order, and the golden is byte stable in git only
 * by luck. The other three registries come out sorted already, and sorting them too costs
 * nothing and says what the file guarantees.
 *
 * Reordering is not observable by a client. Every entry names itself in
 * `description.identifier`, and every reference between the registries - a jigsaw's
 * `start_pool`, a pool element's `location` and `processors`, a structure set's `structures` -
 * is that identifier rather than a position, so no reader can see the difference. The sort is
 * also a permutation of whole entries, which is why the payload keeps its length; the capture
 * asserts that below.
 */
const sortedJigsawRegistries = (payload) => {
    const read = new BinaryStream(payload);
    const reader = new NBTReader(read, ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    const root = reader.parse();

    const identifierOf = (entry) => entry.getCompound('description', false)?.getString('identifier', '') ?? '';
    for (const [name, registry] of root.entries()) {
        if (!(registry instanceof Set)) continue;
        const sorted = [...registry].sort((a, b) => identifierOf(a).localeCompare(identifierOf(b)));
        root.addValue(name, new Set(sorted));
    }

    const write = new BinaryStream();
    const writer = new NBTWriter(write, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(root);
    const sorted = write.getBuffer();

    if (sorted.byteLength !== payload.byteLength) {
        throw new Error(
            `Sorting the jigsaw registries changed the payload from ${payload.byteLength} to ` +
                `${sorted.byteLength} bytes; it may only reorder whole entries.`
        );
    }

    return sorted;
};

// The payload is one NBT compound and nothing else. The biome definitions are kept exactly as
// they came: the client alone interprets them, and the server hands them on verbatim.
const payloadOf = (buffer) => {
    let cursor = 0;
    while ((buffer[cursor++] & 0x80) !== 0); // Step over the header varint.
    return Buffer.from(buffer.subarray(cursor));
};

/** First payload seen per extended packet, keyed by file name. A server sends each once. */
const extended = new Map();

client.getSession().on('raw', ({ id, buffer }) => {
    if (id === PacketIdentifier.JIGSAW_STRUCTURE_DATA) jigsaw = payloadOf(buffer);
    if (id === PacketIdentifier.BIOME_DEFINITION_LIST) biomes = payloadOf(buffer);

    const name = EXTENDED_PACKETS.get(id);
    if (values.extended !== '' && name !== undefined && !extended.has(name)) extended.set(name, payloadOf(buffer));
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

    // Sorted, so that a recapture of an unchanged server is an empty diff rather than the same
    // rules in whichever order the engine's container iterated in this time.
    const rules = sortedJigsawRegistries(jigsaw);
    const jigsawFile = path.join(values.out, 'jigsaw_structure_data.nbt');
    fs.writeFileSync(jigsawFile, rules);
    console.log(`Wrote ${relative(jigsawFile)}`);
    console.log(`  ${rules.byteLength} bytes of jigsaw structure rules`);

    const biomesFile = path.join(values.out, 'biome_definitions_network.nbt');
    fs.writeFileSync(biomesFile, biomes);
    console.log(`Wrote ${relative(biomesFile)}`);
    console.log(`  ${biomes.byteLength} bytes of biome definitions`);

    if (values.extended !== '') {
        fs.mkdirSync(values.extended, { recursive: true });
        for (const [name, payload] of [...extended].sort(([a], [b]) => a.localeCompare(b))) {
            const file = path.join(values.extended, `${name}.bin`);
            fs.writeFileSync(file, payload);
            console.log(`Wrote ${relative(file)} (${payload.byteLength} bytes)`);
        }
        const missing = [...EXTENDED_PACKETS.values()].filter((name) => !extended.has(name));
        if (missing.length > 0) console.warn(`  The server sent no ${missing.join(', ')}`);
    }
} catch (error) {
    console.error(`Could not capture: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    clearInterval(keepalive);
    client.disconnect();
}
