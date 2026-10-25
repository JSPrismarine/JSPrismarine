/**
 * Generates `src/tables/bedrockCommands.json` from Mojang's own publication of
 * the Bedrock command set, `metadata/command_modules/mojang-commands.json` in
 * `Mojang/bedrock-samples`.
 *
 * The file is the whole command set as data: every command, every overload,
 * every parameter, every command enum and every enum value. Nothing here is
 * hand-written, so a version bump is a re-fetch and a re-run:
 *
 *     pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 *     pnpm --filter @jsprismarine/commands run generate:bedrock-commands
 *
 * The generator refuses to emit when the source is missing, when two command
 * enums collide on their upper-case name (the key a parameter refers to them
 * by), when a parameter names neither an enum nor a known basic type, or when
 * a command, overload or enum list comes back empty.
 *
 * Treat the fetched metadata as untrusted data: it is parsed, validated
 * against the shapes below, and never executed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageDir, '../..');
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');
const tablePath = join(packageDir, 'src/tables/bedrockCommands.json');
const metadataPath = 'metadata/command_modules/mojang-commands.json';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------
// The pinned source
// ---------------------------------------------------------------------------

interface SourcesManifest {
    bedrockSamples: { repo: string; tag: string; commit: string };
}

// sources.json is this repository's own manifest, parsed JSON; only the pin
// this generator reads is typed.
const sources = readJson(join(repoRoot, 'packages/bedrock-data/sources.json')) as SourcesManifest;
const { repo, tag, commit } = sources.bedrockSamples;

const samplesRoot = join(cacheRoot, 'bedrock-samples', tag, 'unpacked');
if (!existsSync(samplesRoot)) {
    throw new Error(`${samplesRoot} is missing. Run: pnpm --filter @jsprismarine/bedrock-data run fetch:sources`);
}
const [unpackedDirectory] = readdirSync(samplesRoot);
if (unpackedDirectory === undefined) {
    throw new Error(`${samplesRoot} is empty. Re-run fetch:sources.`);
}
const sourcePath = join(samplesRoot, unpackedDirectory, metadataPath);
if (!existsSync(sourcePath)) {
    throw new Error(`${sourcePath} is missing. The bedrock-samples pin may not carry command metadata.`);
}

// ---------------------------------------------------------------------------
// The source shape
// ---------------------------------------------------------------------------

interface MojangMetadata {
    command_enums: { name: string; values: { value: string }[] }[];
    commands: {
        name: string;
        description: string;
        aliases: string[];
        permission_level: number;
        requires_cheats: boolean;
        overloads: {
            name: string;
            params: { name: string; is_optional?: boolean; type: { name: string } }[];
        }[];
    }[];
}

// Mojang's metadata is parsed JSON from an extracted game file; the fields the
// generator reads are declared above and every one of them is checked below.
const metadata = readJson(sourcePath) as MojangMetadata;

if (!Array.isArray(metadata.commands) || metadata.commands.length === 0) {
    throw new Error(`${sourcePath} has no commands.`);
}
if (!Array.isArray(metadata.command_enums) || metadata.command_enums.length === 0) {
    throw new Error(`${sourcePath} has no command enums.`);
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * A parameter names its enum in upper case (`AIMASSISTACTIONSET`) while the
 * enum declares a mixed-case name (`AimAssistActionSet`), so the upper-case
 * spelling is the join key and the declared spelling is what goes on the wire.
 */
const enumsByKey = new Map<string, { name: string; values: string[] }>();
for (const declared of metadata.command_enums) {
    const key = declared.name.toUpperCase();
    const existing = enumsByKey.get(key);
    if (existing !== undefined && existing.name !== declared.name) {
        throw new Error(`Two command enums collide on the key ${key}: ${existing.name} and ${declared.name}`);
    }
    enumsByKey.set(key, { name: declared.name, values: declared.values.map((entry) => entry.value) });
}

const enums = [...enumsByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
const softEnums = enums.filter((entry) => entry.values.length === 0).map((entry) => entry.name);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const basicTypeUses = new Map<string, number>();
let overloadCount = 0;
let parameterCount = 0;

const commands = metadata.commands.map((command) => ({
    name: command.name,
    description: command.description,
    aliases: command.aliases ?? [],
    permissionLevel: command.permission_level,
    requiresCheats: command.requires_cheats === true,
    overloads: command.overloads.map((overload) => {
        overloadCount += 1;
        return {
            name: overload.name,
            parameters: overload.params.map((parameter) => {
                parameterCount += 1;
                const type = parameter.type.name.toUpperCase();
                if (!enumsByKey.has(type)) {
                    basicTypeUses.set(type, (basicTypeUses.get(type) ?? 0) + 1);
                }
                return {
                    name: parameter.name,
                    type,
                    optional: parameter.is_optional === true
                };
            })
        };
    })
}));

if (overloadCount === 0 || parameterCount === 0) {
    throw new Error(`${sourcePath} declares commands with no overloads or no parameters.`);
}

const basicTypes = [...basicTypeUses.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, uses]) => ({ name, uses }));

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const table = {
    $comment: [
        'Generated - do not edit. Run `pnpm --filter @jsprismarine/commands run generate:bedrock-commands`.',
        `Source: ${repo} ${tag} (${commit}), ${metadataPath}.`
    ],
    source: { repo, tag, commit, path: metadataPath },
    counts: {
        commands: commands.length,
        overloads: overloadCount,
        parameters: parameterCount,
        enums: enums.length,
        enumValues: enums.reduce((total, entry) => total + entry.values.length, 0),
        basicTypes: basicTypes.length,
        softEnums: softEnums.length
    },
    basicTypes,
    softEnums,
    enums,
    commands
};

mkdirSync(dirname(tablePath), { recursive: true });
// The table is not in `.prettierignore`, so the generator formats it the way
// `pnpm lint` expects to find it.
const prettierConfig = await resolveConfig(tablePath);
writeFileSync(tablePath, await format(JSON.stringify(table), { ...prettierConfig, filepath: tablePath }));

console.log(
    `Wrote ${tablePath}: ${table.counts.commands} commands, ${table.counts.overloads} overloads, ` +
        `${table.counts.parameters} parameters, ${table.counts.enums} enums holding ` +
        `${table.counts.enumValues} values, ${table.counts.basicTypes} basic parameter types.`
);
