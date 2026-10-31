const fs = require('node:fs');
const path = require('node:path');
const { createGenerator } = require('ts-json-schema-generator');

const packageDirectory = path.resolve(__dirname, '..');
const sourcePath = path.join(packageDirectory, 'src/config/JsonConfigTypes.ts');
const tsconfigPath = path.join(packageDirectory, 'tsconfig.json');
const schemaDirectory = path.join(packageDirectory, 'schemas');
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
    fs.mkdirSync(schemaDirectory, { recursive: true });

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

        fs.writeFileSync(path.join(schemaDirectory, file), `${JSON.stringify(schema, null, 4)}\n`);
    }
}

if (require.main === module) generateSchemas();

module.exports = { generateSchemas };
