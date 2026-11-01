import { mkdirSync, writeFileSync } from 'node:fs';
import { createGenerator } from 'ts-json-schema-generator';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(packageDirectory, 'src/config/JsonConfigTypes.ts');
const tsconfigPath = join(packageDirectory, 'tsconfig.json');
const schemaDirectory = join(packageDirectory, 'schemas');
const schemaFiles = [
    ['ConfigFile', 'config.schema.json'],
    ['PermissionsFile', 'permissions.schema.json'],
    ['OpsFile', 'ops.schema.json'],
    ['BannedPlayersFile', 'banned-players.schema.json'],
    ['WorldPlayerData', 'player-data.schema.json']
];

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';
const SCHEMA_PROPERTY = {
    type: 'string',
    description: 'The schema URL for the JSPrismarine build that last wrote this file.'
};

/** Generate the package's Draft 7 schemas from its JSON file types. */
function generateSchemas() {
    mkdirSync(schemaDirectory, { recursive: true });

    for (const [type, file] of schemaFiles) {
        const generated = createGenerator({
            path: sourcePath,
            tsconfig: tsconfigPath,
            type,
            jsDoc: 'extended',
            topRef: false
        }).createSchema(type);

        const schema = {
            ...generated,
            $schema: DRAFT_07,
            allowComments: true,
            allowTrailingCommas: true
        };

        if (schema.type === 'object') {
            schema.properties = {
                ...schema.properties,
                $schema: SCHEMA_PROPERTY
            };
        }

        writeFileSync(join(schemaDirectory, file), `${JSON.stringify(schema, null, 4)}\n`);
    }
}

generateSchemas();
