import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Binary payloads, turned into JSON so that a bundler can carry them.
 *
 * Each becomes `src/generated/<name>.json` holding the bytes as base64, which `src/index.ts`
 * hands back as a Buffer. A `.nbt` or `.dat` file cannot be an import on its own.
 */
const files = [
    'resources/entity_identifiers.dat',
    'jsp/jigsaw_structure_data.nbt',
    'jsp/biome_definitions_network.nbt'
];

const force = process.argv.includes('--force');

const isUpToDate = (source, target) => {
    const generated = fs.statSync(target, { throwIfNoEntry: false });
    return generated !== undefined && generated.mtimeMs >= fs.statSync(source).mtimeMs;
};

const requireSource = (file) => {
    const source = path.resolve('src/', file);
    if (fs.existsSync(source)) return source;

    console.error(
        `Missing ${file}. The bedrock-data resources are a git submodule, run \`git submodule update --init --recursive\` from the repository root.`
    );
    process.exit(1);
};

for (const file of files) {
    const filename = path.basename(file);

    const source = requireSource(file);
    const target = path.resolve('src/generated', `${filename.split('.').slice(0, -1).join('.')}.json`);

    if (!force && isUpToDate(source, target)) {
        continue;
    }

    console.log(`Converting ${filename}...`);

    const raw = fs.readFileSync(source);
    console.log(`file size: ${raw.length} bytes`);

    const data = raw.toString('base64');

    fs.writeFileSync(target, JSON.stringify({ data }, null, 0));
}

// The creative menu entries are heterogeneous (some carry block states, some NBT), which
// TypeScript infers as any[] when the JSON is imported directly. A generated module with an
// explicit type gives the data a shape that every consumer, including ahead-of-time
// compilation, can work with.
//
// The upstream field names are not kept: `id` is an item name and is called `name` here,
// `damage` is the aux value every other part of this package calls `meta`, and `block_state_b64`
// is `block_states` on an entry and `icon_block_states` on a group.
const creativeSource = requireSource('resources/creative_items.json');
const creativeTarget = path.resolve('src/generated/creativeitems.ts');
if (force || !isUpToDate(creativeSource, creativeTarget)) {
    console.log('Generating creativeitems.ts...');
    const { groups, items } = JSON.parse(fs.readFileSync(creativeSource, 'utf8'));

    const groupBody = groups
        .map(({ name, category, icon }) => {
            const group = { name, category, icon: icon.id };
            if (icon.block_state_b64 !== undefined) group.icon_block_states = icon.block_state_b64;
            return `    ${JSON.stringify(group)}`;
        })
        .join(',\n');

    // One helper call per entry instead of a 2000-element object literal: TypeScript
    // gives up on the union such a literal implies, while each call has the exact type.
    const itemBody = items
        .map(({ id, groupId, damage, block_state_b64, nbt_b64 }) => {
            const extra = {};
            if (damage !== undefined) extra.meta = damage;
            if (block_state_b64 !== undefined) extra.block_states = block_state_b64;
            if (nbt_b64 !== undefined) extra.nbt = nbt_b64;

            const args =
                Object.keys(extra).length === 0
                    ? `${JSON.stringify(id)}, ${groupId}`
                    : `${JSON.stringify(id)}, ${groupId}, ${JSON.stringify(extra)}`;
            return `    entry(${args})`;
        })
        .join(',\n');

    fs.writeFileSync(
        creativeTarget,
        [
            '// Generated from resources/creative_items.json by utils/build.js. Do not edit.',
            '',
            '/** One heading of the creative menu, with the item the client draws beside it. */',
            'export interface CreativeGroupEntry {',
            '    /** A translation key such as `itemGroup.name.planks`. */',
            '    name: string;',
            '    /** Which tab the heading sits in: `construction`, `nature`, `equipment` or `items`. */',
            '    category: string;',
            '    /** The item name shown beside the heading. */',
            '    icon: string;',
            '    /**',
            '     * The block state the icon shows, as base64 little-endian NBT whose `network_id` is the',
            '     * hashed block runtime id vanilla puts on the wire. Absent when the icon is not a block.',
            '     */',
            '    icon_block_states?: string;',
            '}',
            '',
            '/** One entry of the creative menu as the client orders it. */',
            'export interface CreativeItemEntry {',
            '    name: string;',
            '    /** Which of {@link creative_groups} the entry is filed under, by index. */',
            '    group: number;',
            '    /**',
            '     * The block state the entry places, as base64 little-endian NBT whose `network_id` is the',
            '     * hashed block runtime id vanilla puts on the wire. Absent when the entry is not a block,',
            '     * which includes the item form of doors, beds and hanging signs.',
            '     */',
            '    block_states?: string;',
            '    meta?: number;',
            '    nbt?: string;',
            '}',
            '',
            'const entry = (',
            '    name: string,',
            '    group: number,',
            "    extra: Omit<CreativeItemEntry, 'name' | 'group'> = {}",
            '): CreativeItemEntry => {',
            '    const item: CreativeItemEntry = { name, group };',
            '    if (extra.block_states !== undefined) item.block_states = extra.block_states;',
            '    if (extra.meta !== undefined) item.meta = extra.meta;',
            '    if (extra.nbt !== undefined) item.nbt = extra.nbt;',
            '    return item;',
            '};',
            '',
            '/** The headings of the creative menu, in the order the client draws them. */',
            'export const creative_groups: CreativeGroupEntry[] = [',
            groupBody,
            '];',
            '',
            'export const creativeitems: CreativeItemEntry[] = [',
            itemBody,
            '];',
            ''
        ].join('\n')
    );
}
