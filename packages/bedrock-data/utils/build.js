import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const files = [
    'resources/biome_definitions.nbt',
    'resources/entity_identifiers.nbt',
    'jsp/runtime_block_states.dat',
    'jsp/jigsaw_structure_data.nbt',
    'jsp/biome_definitions_network.nbt',
    'resources/r12_to_current_block_map.bin'
];

const force = process.argv.includes('--force');

const isUpToDate = (source, target) => {
    const generated = fs.statSync(target, { throwIfNoEntry: false });
    return generated !== undefined && generated.mtimeMs >= fs.statSync(source).mtimeMs;
};

for (const file of files) {
    const filename = path.basename(file);

    const source = path.resolve('src/', file);
    const target = path.resolve('src/generated', `${filename.split('.').slice(0, -1).join('.')}.json`);

    if (!fs.existsSync(source)) {
        console.error(
            `Missing ${file}. The bedrock-data resources are a git submodule, run \`git submodule update --init --recursive\` from the repository root.`
        );
        process.exit(1);
    }

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
const creativeSource = path.resolve('src/resources/creativeitems.json');
const creativeTarget = path.resolve('src/generated/creativeitems.ts');
if (force || !isUpToDate(creativeSource, creativeTarget)) {
    console.log('Generating creativeitems.ts...');
    const entries = JSON.parse(fs.readFileSync(creativeSource, 'utf8'));
    // One helper call per entry instead of a 1900-element object literal: TypeScript
    // gives up on the union such a literal implies, while each call has the exact type.
    const body = entries
        .map((entry) => {
            const { name, ...extra } = entry;
            const args =
                Object.keys(extra).length === 0
                    ? JSON.stringify(name)
                    : `${JSON.stringify(name)}, ${JSON.stringify(extra)}`;
            return `    entry(${args})`;
        })
        .join(',\n');
    fs.writeFileSync(
        creativeTarget,
        [
            '// Generated from resources/creativeitems.json by utils/build.js. Do not edit.',
            '',
            '/** One entry of the creative menu as the client orders it. */',
            'export interface CreativeItemEntry {',
            '    name: string;',
            '    block_states?: string;',
            '    meta?: number;',
            '    nbt?: string;',
            '}',
            '',
            "const entry = (name: string, extra: Omit<CreativeItemEntry, 'name'> = {}): CreativeItemEntry => {",
            '    const item: CreativeItemEntry = { name };',
            '    if (extra.block_states !== undefined) item.block_states = extra.block_states;',
            '    if (extra.meta !== undefined) item.meta = extra.meta;',
            '    if (extra.nbt !== undefined) item.nbt = extra.nbt;',
            '    return item;',
            '};',
            '',
            'export const creativeitems: CreativeItemEntry[] = [',
            body,
            '];',
            ''
        ].join('\n')
    );
}
