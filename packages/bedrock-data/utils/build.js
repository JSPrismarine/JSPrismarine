import fs from 'node:fs';
import path from 'node:path';

const files = [
    'resources/biome_definitions.nbt',
    'resources/entity_identifiers.nbt',
    'src/jsp/runtime_block_states.dat',
    'resources/r12_to_current_block_map.bin'
];

for (const file of files) {
    const filename = path.basename(file);
    console.log(`Converting ${filename}...`);

    const dir = path.resolve(file);
    const raw = fs.readFileSync(dir);
    console.log(`file size: ${raw.length} bytes`);

    const data = raw.toString('base64');

    fs.writeFileSync(
        path.resolve('src/generated', `${filename.split('.').slice(0, -1).join('.')}.json`),
        JSON.stringify({ data }, null, 0)
    );
}
