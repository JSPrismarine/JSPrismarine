import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const files = [
    'resources/biome_definitions.nbt',
    'resources/entity_identifiers.nbt',
    'jsp/runtime_block_states.dat',
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
