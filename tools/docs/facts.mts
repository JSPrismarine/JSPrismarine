/**
 * Docs facts: values the documentation quotes that the code owns, such as the supported protocols, the
 * Node.js requirement or the commands the server registers.
 *
 * A page marks such a value instead of typing it in for good:
 *
 *     Node.js <!-- fact:node.minimum -->`26.4.0`<!-- /fact --> or newer
 *
 * GitHub hides the comments, so the source still reads naturally. The docs build replaces every marked
 * value with the current one and drops the markers, so the site never quotes a stale number.
 * `pnpm run docs:facts` writes the current values back into the Markdown for readers of the source.
 *
 * The marked text keeps its wrapping: inline code stays inline code, and a fenced block keeps its fence
 * and language, so only the value itself changes.
 *
 * Counts of game data come from the downloads the data scripts cache (the Java datapack and reports,
 * bedrock-samples, the BDS behavior pack). A checkout without them, such as the lint job, keeps the
 * Markdown's values for those facts; the docs build fetches them first, so the site always counts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    ADDON_INDEX_FILE,
    ADDON_INDEX_SCHEMA_VERSION,
    ADDON_RELEASE_TAG,
    createAddonIndex,
    packFileName,
    serializeAddonIndex
} from '../../packages/addon-tools/src/addonIndex.ts';
import { ADDON_FILES, ADDON_MODULE_TYPES } from '../../packages/addon-tools/src/addon.ts';
import { releaseDownloadUrl } from '../../packages/addon-tools/src/build.ts';
import { USAGE as ADDON_TOOLS_USAGE } from '../../packages/addon-tools/src/command.ts';
import type { AddonsFile, AddonsLockFile } from '../../packages/prismarine/src/addons/addonFiles.ts';
import {
    ADDONS_DIRECTORY,
    ADDONS_FILE,
    ADDONS_LOCK_FILE,
    ADDONS_LOCKFILE_VERSION,
    DEFAULT_ADDON_SOURCE,
    serializeAddonsFile,
    serializeAddonsLockFile
} from '../../packages/prismarine/src/addons/addonFiles.ts';
import { CompressionType } from '../../packages/leveldb/src/compression/Compression.ts';
import { CommandPermissionLevel } from '../../packages/minecraft/src/CommandPermissionLevel.ts';
import { resolveOptions } from '../../packages/leveldb/src/DatabaseOptions.ts';
import { DEFAULT_BLOCK_SIZE } from '../../packages/leveldb/src/format/TableBuilder.ts';
import { userCacheDir } from '../../packages/server/src/packaged/userCache.ts';
import { BETA_APIS, WORLD_EXPERIMENTS } from '../../packages/prismarine/src/world/WorldExperiments.ts';
import { DEFAULT_DEBUGGER_PORT } from '../../packages/script-host/src/debugger/protocol.ts';
import { SCRIPT_MODULE_HISTORIES } from '../../packages/script-host/src/generated/scriptModules.ts';
import type { MemberDefinition, TypeDefinition } from '../../packages/script-host/src/host/jsprismarineServer.ts';
import { PLACEHOLDER_NAME } from '../../packages/script-host/src/host/placeholders.ts';
import {
    JSPRISMARINE_PLACEHOLDER_TYPES,
    JSPRISMARINE_PLACEHOLDERS,
    JSPRISMARINE_SERVER,
    JSPRISMARINE_TYPES
} from '../../packages/script-host/src/host/jsprismarineServer.ts';
import { DEFAULT_ALLOWED_MODULES } from '../../packages/script-host/src/host/pack.ts';
import { STEPS_PER_MILLISECOND } from '../../packages/script-host/src/host/WorldScripts.ts';
import { PUBLISHED_PLATFORMS } from '../../packages/script-host/src/platform.ts';
import { currentBeta } from '../../packages/script-host/src/shape/resolve.ts';
import {
    HEIGHT_BLENDING_RANGE_CHUNKS,
    OLD_CHUNK_CARVING_DISTANCE
} from '../../packages/worldgen/src/blending/Blender.ts';
import {
    RETROGEN_END_Y,
    RETROGEN_MIN_Y,
    RETROGEN_OLD_BEDROCK_MAX_Y
} from '../../packages/worldgen/src/blending/belowZeroRetrogen.ts';
import {
    GENERATION_DATA_VERSION,
    OLD_GENERATION_BELOW_DATA_VERSION
} from '../../packages/worldgen/src/blending/generationVersion.ts';
import { cardStyles } from './site/.vitepress/og/cardImage.ts';
import { brandPurposes } from './site/.vitepress/theme/brandCatalog.ts';
import { palette } from './site/.vitepress/theme/tokens.ts';
import { addonCatalog, loadAddons, releaseWorkflow, releaseWorkflowInputs } from './addons.mts';
import type { ErrorData, ErrorDomainData } from './code-data.mts';
import {
    errorCount,
    loadBStatsSettings,
    loadCommands,
    loadErrors,
    loadOptionalSettings,
    loadServerCommands,
    loadSettings
} from './code-data.mts';
import { loadProject, repoRoot } from './project.mts';

/** Pinned downloads in `packages/bedrock-data/sources.json`, as far as the docs quote them. */
interface Sources {
    bds: {
        defaultProtocolVersion: number;
        versions: Record<string, { minecraftVersion: string; serverVersion: string; sizeInBytes: number }>;
    };
    bedrockSamples: { tag: string };
    javaServer: { defaultVersion: string; versions: Record<string, { sizeInBytes: number; preview?: boolean }> };
}

/** The Java release `sources.json` pins as the preview, or undefined when it pins none. */
const javaPreview = (sources: Sources) =>
    Object.entries(sources.javaServer.versions).find(([, entry]) => entry.preview === true)?.[0];

/** The data pack format a `datagen:java` version record declares, as `major.minor`. */
function recordFormat(file: string) {
    const format = field(JSON.parse(readFileSync(file, 'utf8')), 'dataPackFormat');
    if (!Array.isArray(format)) throw new Error(`${file} is not a datagen:java version record`);
    return format.join('.');
}

/** Megabytes as a reader sees them on a download, such as `95 MB`. */
const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** Joins words into lines of at most `width` characters, for a list shown in a code block. */
function wrap(words: readonly string[], width = 100) {
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        if (line && line.length + 1 + word.length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) lines.push(line);
    return lines.join('\n');
}

/** "a", "a and b", "a, b and c". */
const list = (items: readonly string[]) =>
    items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** A Markdown table with padded columns, matching how Prettier formats one. */
function table(header: readonly string[], rawRows: readonly (readonly string[])[]) {
    // A pipe inside a cell, even in inline code, would end the cell, so every cell escapes its pipes.
    const rows = rawRows.map((row) => row.map((cell) => cell.replaceAll('|', '\\|')));
    const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map((row) => row[column].length)));
    const line = (cells: readonly string[]) =>
        `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
    return [line(header), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** Text as inline code, with a fence longer than any run of backticks inside it. */
const inlineCode = (text: string) => {
    const fence = '`'.repeat(Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length)) + 1);
    return fence.length > 1 ? `${fence} ${text} ${fence}` : `\`${text}\``;
};

/** The package a domain's errors come from, as the reference names it. */
const errorDomainPackage = (domain: string) =>
    domain === 'common' ? '@jsprismarine/errors' : `@jsprismarine/${domain}`;

/** One error as its section of the reference: the code as the heading, so the link's anchor lands on it. */
const errorSection = (error: ErrorData, heading: string) =>
    [
        `${heading} ${inlineCode(error.code)}`,
        inlineCode(error.template),
        `Thrown as ${inlineCode(error.thrownAs)}, which extends ${inlineCode(error.base)}.`,
        ...(error.description ? [error.description] : [])
    ].join('\n\n');

/** A domain's page body: the classes that group its errors, then every error, by module when it has several. */
const errorDomainPage = ({ categories, groups }: ErrorDomainData) => {
    const parts: string[] = [];
    if (categories.length > 0) {
        parts.push(
            '## Groups',
            'Catch one of these classes to handle every error that extends it.',
            table(
                ['Class', 'What its errors mean'],
                categories.map(({ name, description }) => [inlineCode(name), description.replace(/\s*\n\s*/g, ' ')])
            )
        );
    }
    for (const { module, errors } of groups) {
        const nested = groups.length > 1;
        if (nested) parts.push(`## ${module[0]?.toUpperCase()}${module.slice(1)}`);
        parts.push(...errors.map((error) => errorSection(error, nested ? '###' : '##')));
    }
    return parts.join('\n\n');
};

/** The error reference: every error the catalog in `@jsprismarine/errors` defines, a page per domain. */
async function errorFacts() {
    const domains = await loadErrors();
    // The example is a real entry, logged by the real logger, so the page shows what a log holds.
    const { PrismarineServerErrors } = await import('../../packages/errors/src/prismarine/server.ts');
    const { Logger } = await import('../../packages/logger/src/logger.ts');
    const example = new PrismarineServerErrors.PlayerNotFound({ username: 'Steve' });
    const logged: string[] = [];
    new Logger('error', [{ log: (record: { message: string }) => void logged.push(record.message) }]).error(example);
    return {
        'errors.example.code': example.code,
        'errors.example.template': PrismarineServerErrors.PlayerNotFound.template,
        'errors.example.message': example.message,
        'errors.example.reference': logged[0]?.split('\n').at(-1) ?? '',
        'errors.count': String(domains.reduce((total, domain) => total + errorCount(domain), 0)),
        'errors.domains': `\n${table(
            ['Package', 'Errors'],
            domains.map((domain) => [
                `[${inlineCode(errorDomainPackage(domain.domain))}](${domain.domain}.md)`,
                String(errorCount(domain))
            ])
        )}\n`,
        ...Object.fromEntries(
            domains.map((domain) => [`errors.page.${domain.domain}`, `\n${errorDomainPage(domain)}\n`])
        )
    };
}

/** Command facts, from the registration the server runs. */
async function commandFacts() {
    const { implemented, registered, unwired } = await loadCommands();
    return {
        'commands.implemented': String(implemented),
        'commands.registered': String(registered.length),
        'commands.unwired': String(unwired.length),
        'commands.unwired.example': `/${unwired[0]?.[0] ?? ''}`,
        // Surrounded by blank lines so the table stays its own block between the markers.
        'commands.unwired.table': `\n${table(
            ['Command', 'What it would need'],
            unwired.map(([name, reason]) => [`\`/${name}\``, reason])
        )}\n`,
        'commands.registered.list': wrap(registered.map(({ name }) => name)),
        'commands.bedrockTable': `\n${bedrockCommandCountsTable()}\n`
    };
}

/** The counts the Bedrock command table generator measured, from the table it wrote. */
function bedrockCommandCountsTable() {
    // Parsed JSON written by `generate-bedrock-commands.ts`; `counts` is the one field read.
    const { counts } = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'commands', 'src', 'tables', 'bedrockCommands.json'), 'utf8')
    ) as { counts: Record<string, number> };
    const rows: [string, string][] = [
        ['Commands', 'commands'],
        ['Overloads', 'overloads'],
        ['Parameters', 'parameters'],
        ['Command enums', 'enums'],
        ['Enum values', 'enumValues'],
        ['Basic parameter types', 'basicTypes'],
        ['Soft enums', 'softEnums']
    ];
    return table(
        ["In Mojang's Bedrock table", 'Count'],
        rows.map(([label, key]) => [label, String(counts[key])])
    );
}

/** An operator's permission level; a command above it is the console's alone. */
const CONSOLE_ONLY_ABOVE = CommandPermissionLevel.OWNER;

/** The command reference: every command the server answers, with its permission and who has it. */
async function commandReferenceFacts() {
    const commands = (await loadServerCommands()).sort((a, b) => a.name.localeCompare(b.name));
    const defaults = commands.filter(({ everyone, level }) => everyone && level === 0);
    return {
        'commands.server': String(commands.length),
        // Led by a verb: a value that starts and ends in a backtick would read as one inline code span.
        'commands.defaults': `run ${list(defaults.map(({ name }) => `\`/${name}\``))}`,
        'commands.reference.table': `\n${table(
            ['Command', 'Description', 'Permission', 'Level', 'Granted to'],
            commands.map(({ name, aliases, description, permission, level, everyone }) => [
                [name, ...aliases].map((alias) => `\`/${alias}\``).join(', '),
                description,
                `\`${permission}\``,
                String(level),
                level > CONSOLE_ONLY_ABOVE ? 'The console' : everyone && level === 0 ? 'Everyone' : 'Operators'
            ])
        )}\n`
    };
}

/** Fails the facts run for a setting a page names that a fresh config no longer writes. */
const missingSetting = (key: string): never => {
    throw new Error(`The docs facts no longer find ${key} in a fresh config.json.`);
};

/** Settings facts, from the file a fresh server writes. */
async function configFacts() {
    const rows = (await loadSettings()).map(({ key, comment }) => [`\`${key}\``, comment]);
    const optional = (await loadOptionalSettings()).map(({ key, comment }) => [`\`${key}\``, comment]);
    return {
        'config.count': String(rows.length),
        'config.table': `\n${table(['Setting', 'What it does'], rows)}\n`,
        // Read when present, never written: a fresh file leaves them out.
        'config.optionalCount': String(optional.length),
        'config.optionalTable': `\n${table(['Setting', 'What it does'], optional)}\n`,
        // The settings that add packs to the stack, for the page about extending the server.
        'config.contentTable': `\n${table(
            ['Setting', 'What it does'],
            rows.filter(([key]) => key.startsWith('`content-'))
        )}\n`
    };
}

/** bStats facts, from the chart table, the service constants, the schedule and the settings. */
async function bstatsFacts() {
    const { BSTATS_CHARTS, chartId } = await import('../../packages/prismarine/src/stats/bstats/charts.ts');
    const { BSTATS_ENDPOINT, BSTATS_PLATFORM, BSTATS_SERVICE_ID, BSTATS_SERVICE_NAME } =
        await import('../../packages/prismarine/src/stats/bstats/service.ts');
    const { BSTATS_SCHEDULE } = await import('../../packages/prismarine/src/stats/bstats/BStatsProvider.ts');
    const { BSTATS_OPT_OUT, CI_VARIABLE } = await import('../../packages/prismarine/src/stats/bstats/serverBStats.ts');
    const { TEST_RUNNER_VARIABLE } = await import('../../packages/prismarine/src/utils/isTestRunner.ts');
    const { buildPayload } = await import('../../packages/prismarine/src/stats/bstats/payload.ts');
    const { DEVICE_OS_NAMES } = await import('../../packages/prismarine/src/stats/serverMetrics.ts');
    const { SERVER_UUID_FILE } = await import('../../packages/prismarine/src/serverUuid.ts');
    const settings = await loadBStatsSettings();
    // One sample host per kind of `node:os` type, run through the payload builder.
    const osSamples = [
        ['Linux', { type: 'Linux', release: '6.1.0-18-amd64', version: '#1 SMP PREEMPT_DYNAMIC Debian 6.1.76-1' }],
        ['macOS 14.5', { type: 'Darwin', release: '23.5.0', version: 'Darwin Kernel Version 23.5.0' }],
        ['Windows 11', { type: 'Windows_NT', release: '10.0.22631', version: 'Windows 11 Pro' }],
        ['FreeBSD', { type: 'FreeBSD', release: '13.1-RELEASE-p9', version: 'FreeBSD 13.1-RELEASE-p9' }]
    ] as const;
    const osFields = ['nodeOsType', 'nodeOsRelease', 'nodeOsVersion'] as const;
    const settingKey = (key: string) => (settings.some((setting) => setting.key === key) ? key : missingSetting(key));
    const minutes = (ms: number) => `${ms / 60_000} minutes`;
    const firstMs = BSTATS_SCHEDULE.firstDelayMinMs;
    return {
        'bstats.service': BSTATS_SERVICE_NAME,
        'bstats.serviceId': String(BSTATS_SERVICE_ID),
        'bstats.servicePage': `[${BSTATS_SERVICE_NAME} on bStats](https://bstats.org/plugin/${BSTATS_PLATFORM}/${BSTATS_SERVICE_NAME}/${BSTATS_SERVICE_ID})`,
        'bstats.endpoint': BSTATS_ENDPOINT,
        // The file that holds the UUID bStats sends as the server's identity.
        'bstats.serverUuidFile': SERVER_UUID_FILE,
        'bstats.firstSubmit': `${firstMs / 60_000} to ${minutes(firstMs + BSTATS_SCHEDULE.firstDelaySpreadMs)}`,
        'bstats.secondSubmit': minutes(BSTATS_SCHEDULE.secondDelaySpreadMs),
        'bstats.period': minutes(BSTATS_SCHEDULE.periodMs),
        'bstats.optOut': `${BSTATS_OPT_OUT.variable}=${BSTATS_OPT_OUT.off[0]}`,
        'bstats.optOutVariable': BSTATS_OPT_OUT.variable,
        'bstats.ciVariable': CI_VARIABLE,
        'bstats.testRunnerVariable': TEST_RUNNER_VARIABLE,
        'bstats.osExamples': `\n${table(
            ['Host', ...osFields.map((field) => `\`${field}\``)],
            osSamples.map(([host, os]) => {
                const platform = { ...os, arch: 'x64', coreCount: 1, memoryGb: 1 };
                const payload = buildPayload({ platform, metrics: new Map() }, '');
                return [host, ...osFields.map((field) => `\`${payload[field]}\``)];
            })
        )}\n`,
        'bstats.playerPlatformChart': BSTATS_CHARTS.player_platform.title,
        'bstats.playerPlatforms': Object.values(DEVICE_OS_NAMES)
            .map((name) => `\`${name}\``)
            .join(', '),
        'bstats.optOutValues': BSTATS_OPT_OUT.off.map((value) => `\`${value}\``).join(', '),
        'bstats.optInValues': BSTATS_OPT_OUT.on.map((value) => `\`${value}\``).join(', '),
        'bstats.enabledKey': settingKey('stats.bstats.enabled'),
        'bstats.logSentDataKey': settingKey('stats.bstats.log-sent-data'),
        'bstats.logErrorsKey': settingKey('stats.bstats.log-errors'),
        'bstats.endpointKey': settingKey('stats.bstats.endpoint'),
        // The smallest `config.json` that turns bStats off, built from the key's path.
        'bstats.optOutConfig': JSON.stringify(
            settingKey('stats.bstats.enabled')
                .split('.')
                .reduceRight<unknown>((value, key) => ({ [key]: value }), false),
            null,
            4
        ),
        'bstats.settings': `\n${table(
            ['Setting', 'Default', 'What it does'],
            settings.map(({ key, value, description }) => [`\`${key}\``, `\`${value}\``, description])
        )}\n`,
        'bstats.charts': `\n${table(
            ['Chart', 'ID', 'What it sends'],
            Object.entries(BSTATS_CHARTS).map(([name, { title, description }]) => [
                title,
                `\`${chartId(name)}\``,
                description
            ])
        )}\n`
    };
}

/** Operating systems as `process.platform` names them, by the names readers know them by. */
const OS_NAMES: Record<string, string> = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };

/** A platform key such as `linux-x64-musl`, in words: "Linux on x64 with musl". */
const platformName = (key: string) => {
    const [os = '', arch = '', libc] = key.split('-');
    const processor = os === 'darwin' && arch === 'arm64' ? 'Apple silicon' : arch;
    return `${OS_NAMES[os] ?? os} on ${processor}${libc === undefined ? '' : ` with ${libc === 'gnu' ? 'glibc' : libc}`}`;
};

/**
 * The Script API modules and versions a pack can declare, read from the generated script module
 * histories; the modules a world allows without a `permissions.json`; the watchdog's step budget;
 * the platforms the script host builds on; and the members of `@jsprismarine/server`, read from the
 * definition its runtime and typings share.
 */
function scriptingFacts() {
    const history = SCRIPT_MODULE_HISTORIES['@minecraft/server'];
    const beta = history === undefined ? undefined : currentBeta(history);
    if (beta === undefined) throw new Error('The docs facts no longer find a beta of @minecraft/server.');
    // The newest major version of `@minecraft/server` and the stable version a pack declaring it gets.
    const [newestMajor, newestStable] =
        Object.entries(history?.resolves ?? {}).sort(([a], [b]) => Number(b) - Number(a))[0] ?? [];
    if (newestStable === undefined) throw new Error('The docs facts no longer find a stable @minecraft/server.');
    const modules = Object.values(SCRIPT_MODULE_HISTORIES).map((module) => {
        const stable = Object.entries(module.resolves)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([major, version]) => `${major}.x: ${inlineCode(version)}`);
        const moduleBeta = currentBeta(module);
        return [
            inlineCode(module.module),
            stable.length === 0 ? 'none' : stable.join(', '),
            moduleBeta === undefined ? 'none' : inlineCode(moduleBeta),
            DEFAULT_ALLOWED_MODULES.includes(module.module) ? 'yes' : 'no'
        ];
    });
    /** A function's row name: its name and its parameters' names. */
    const call = (name: string, parameters: string) =>
        inlineCode(
            `${name}(${parameters
                .split(', ')
                .map((parameter) => parameter.split(/\??:/)[0])
                .join(', ')})`
        );
    /** A property's type as the table writes it. A union would break the table, so none is one. */
    const typeCell = (type: string) => (['string', 'number', 'boolean'].includes(type) ? type : inlineCode(type));
    /** The member table's rows of one module. */
    const memberRows = (definitions: Readonly<Record<string, MemberDefinition>>): string[][] =>
        Object.entries(definitions).flatMap(([name, member]): string[][] => {
            if (member.kind === 'function') return [[call(name, member.parameters), 'function', member.summary]];
            if (member.kind === 'methods') {
                return [
                    [inlineCode(name), 'object', member.summary],
                    ...Object.entries(member.properties ?? {}).map(([key, property]) => [
                        inlineCode(`${name}.${key}`),
                        typeCell(property.type),
                        property.summary
                    ]),
                    ...Object.entries(member.methods).map(([key, method]) => [
                        call(`${name}.${key}`, method.parameters),
                        'function',
                        method.summary
                    ])
                ];
            }
            return [
                [inlineCode(name), 'object', member.summary],
                ...Object.entries<{ readonly type: string; readonly summary: string; readonly value?: string }>(
                    member.properties
                ).map(([key, property]) => [
                    inlineCode(`${name}.${key}`),
                    property.value !== undefined
                        ? inlineCode(JSON.stringify(property.value))
                        : typeCell(property.type === 'numbers' ? 'readonly number[]' : property.type),
                    property.summary
                ])
            ];
        });
    /** The type table's rows of one module. */
    const typeRows = (definitions: Readonly<Record<string, TypeDefinition>>): string[][] =>
        Object.entries(definitions).flatMap(([name, type]): string[][] => {
            if (type.kind === 'union') {
                return [
                    [
                        inlineCode(name),
                        'string',
                        `${type.summary} One of ${type.values.map((value) => inlineCode(value)).join(', ')}.`
                    ]
                ];
            }
            return [
                [inlineCode(name), 'interface', type.summary],
                ...Object.entries(type.properties).map(([key, property]) => [
                    inlineCode(`${name}.${key}${property.optional === true ? '?' : ''}`),
                    typeCell(property.type),
                    property.summary
                ]),
                ...Object.entries(type.methods ?? {}).map(([key, method]) => [
                    call(`${name}.${key}`, method.parameters),
                    'function',
                    method.summary
                ])
            ];
        });
    return {
        'scripting.serverBeta': beta,
        // A whole phrase, since the declared major version follows the newest one served.
        'scripting.resolveExample': `version ${inlineCode(`${newestMajor}.0.0`)} gets ${inlineCode(newestStable)}`,
        'scripting.modules.table': `\n${table(
            ['Module', 'Stable versions served', 'Beta served', 'Allowed without `permissions.json`'],
            modules
        )}\n`,
        'scripting.stepsPerMillisecond': String(STEPS_PER_MILLISECOND),
        'scripting.buildPlatforms': list(PUBLISHED_PLATFORMS.map(platformName)),
        'scripting.jspModule.table': `\n${table(['Member', 'Type', 'What it is'], memberRows(JSPRISMARINE_SERVER))}\n`,
        'scripting.jspModule.types': `\n${table(['Type', 'Kind', 'What it is'], typeRows(JSPRISMARINE_TYPES))}\n`,
        'scripting.placeholdersModule.table': `\n${table(
            ['Member', 'Type', 'What it is'],
            memberRows(JSPRISMARINE_PLACEHOLDERS)
        )}\n`,
        'scripting.placeholdersModule.types': `\n${table(
            ['Type', 'Kind', 'What it is'],
            typeRows(JSPRISMARINE_PLACEHOLDER_TYPES)
        )}\n`,
        // The pattern a namespace or key matches, as the registry tests it.
        'scripting.placeholderName': inlineCode(PLACEHOLDER_NAME.source.replace(/^\^|\$$/g, ''))
    };
}

/** The events `Server.on` accepts, read from the `ServerEvents` map that types it. */
function eventFacts() {
    const source = readFileSync(
        path.join(repoRoot, 'packages', 'prismarine', 'src', 'events', 'ServerEvents.ts'),
        'utf8'
    );
    const map = /export type ServerEvents = \{([\s\S]*?)\};/.exec(source)?.[1] ?? '';
    const events = [...map.matchAll(/(\w+): \[(\w+)\];/g)].map(([, name, type]) => [`\`${name}\``, `\`${type}\``]);
    if (!events.length) throw new Error('The docs facts no longer find the ServerEvents map in ServerEvents.ts.');
    return {
        'events.count': String(events.length),
        'events.table': `\n${table(['Event', 'Listener receives'], events)}\n`
    };
}

/**
 * The count budgets a world tick runs under, read from the constants that set them. No budget in a
 * tick is a time, so these counts are the whole of what bounds the work.
 */
function tickBudgetFacts() {
    const src = path.join(repoRoot, 'packages', 'prismarine', 'src');
    const budgets = {
        'tick.inputBudget': ['network/InputQueue.ts', 'INPUT_ADMISSION_BUDGET_PER_TICK'],
        'tick.chunkAdmissionBudget': ['world/ChunkAdmissions.ts', 'CHUNK_ADMISSION_BUDGET_PER_TICK'],
        'tick.blockUpdateBudget': ['world/BlockUpdateScheduler.ts', 'BLOCK_UPDATE_BUDGET_PER_TICK'],
        'tick.scheduledTickBudget': ['world/WorldSystems.ts', 'SCHEDULED_TICK_BUDGET_PER_TICK'],
        'tick.lightBudget': ['world/WorldSystems.ts', 'LIGHT_BUDGET_PER_TICK'],
        'tick.lightChunkBudget': ['world/WorldSystems.ts', 'LIGHT_CHUNKS_PER_TICK']
    } as const;
    return Object.fromEntries(
        Object.entries(budgets).map(([fact, [file, name]]) => {
            const source = readFileSync(path.join(src, file), 'utf8');
            const value = new RegExp(`export const ${name} = (\\d+);`).exec(source)?.[1];
            if (value === undefined) throw new Error(`The docs facts no longer find ${name} in ${file}.`);
            return [fact, value];
        })
    );
}

/** How many cores chunk generation leaves to the server thread, read off the constant that decides it. */
function generationFacts() {
    const source = readFileSync(
        path.join(repoRoot, 'packages', 'prismarine', 'src', 'world', 'generators', 'chunkConcurrency.ts'),
        'utf8'
    );
    const reserved = /export const RESERVED_CORES = (\d+);/.exec(source)?.[1];
    if (reserved === undefined) throw new Error('The docs facts no longer find RESERVED_CORES in chunkConcurrency.ts.');
    return { 'generation.reservedCores': reserved };
}

/** What the `fluid-replacement` setting and chunk settling run on, read from the code that decides them. */
function fluidFacts() {
    const replacement = sourceText('packages/prismarine/src/content/world/fluidReplacement.ts');
    const fallback = /export const DEFAULT_FLUID_REPLACEMENT: FluidReplacement = '([a-z]+)';/.exec(replacement)?.[1];
    const tag = /export const WASHED_AWAY_BY_FLUIDS = '([a-z:_]+)';/.exec(replacement)?.[1];
    const reach = /const SETTLING_REACH = (\d+);/.exec(sourceText('packages/prismarine/src/world/World.ts'))?.[1];
    if (fallback === undefined || tag === undefined || reach === undefined) {
        throw new Error('The docs facts no longer find the fluid replacement default, its tag or SETTLING_REACH.');
    }
    const side = Number(reach) * 2 + 1;
    return {
        'fluidReplacement.default': fallback,
        'fluidReplacement.tag': `#${tag}`,
        'settling.neighbors': String(side * side - 1)
    };
}

/** A source file the facts below quote, read as text. */
const sourceText = (...segments: string[]) => readFileSync(path.join(repoRoot, ...segments), 'utf8');

/** The numbers the world blender and the below-zero upgrade run on, read from the code that uses them. */
function blendingFacts() {
    const record = readFileSync(
        path.join(repoRoot, 'packages/prismarine/src/world/providers/leveldb/ChunkGenerationRecord.ts'),
        'utf8'
    );
    const firstCavesAndCliffs = /export const FIRST_CAVES_AND_CLIFFS_CHUNK_VERSION = (\d+);/.exec(record)?.[1];
    if (firstCavesAndCliffs === undefined) {
        throw new Error('The docs facts no longer find FIRST_CAVES_AND_CLIFFS_CHUNK_VERSION.');
    }
    // The oracle's fixture for the default Java release, counted rather than restated.
    const sources: Sources = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
    );
    const vectors: unknown = JSON.parse(
        readFileSync(
            path.join(repoRoot, 'packages/worldgen/vectors', sources.javaServer.defaultVersion, 'blending.json'),
            'utf8'
        )
    );
    const countOf = (field: string): string => {
        const list = typeof vectors === 'object' && vectors !== null ? Reflect.get(vectors, field) : undefined;
        if (!Array.isArray(list)) throw new Error(`The docs facts no longer find ${field} in blending.json.`);
        return String(list.length);
    };
    return {
        'blending.vectorRecords': countOf('records'),
        'blending.vectorCenters': countOf('centers'),
        'blending.dataVersion': String(GENERATION_DATA_VERSION),
        'blending.oldBelowDataVersion': String(OLD_GENERATION_BELOW_DATA_VERSION),
        'blending.rangeChunks': String(HEIGHT_BLENDING_RANGE_CHUNKS),
        'blending.carvingDistance': String(OLD_CHUNK_CARVING_DISTANCE),
        'blending.firstCavesAndCliffsChunkVersion': firstCavesAndCliffs,
        'blending.retrogenMinY': String(RETROGEN_MIN_Y),
        // The upgrade's end is exclusive, so the highest y it fills is one below it.
        'blending.retrogenMaxY': String(RETROGEN_END_Y - 1),
        'blending.oldBedrockMaxY': String(RETROGEN_OLD_BEDROCK_MAX_Y)
    };
}

/**
 * How far clients follow an entity, and how the chunk admission step shares its turns, read off the
 * constants that decide them.
 */
function replicationFacts() {
    const shown = sourceText('packages', 'prismarine', 'src', 'world', 'ShownActor.ts');
    const range = (name: string) => {
        const value = new RegExp(`export const ${name} = (\\d+);`).exec(shown)?.[1];
        if (value === undefined) throw new Error(`The docs facts no longer find ${name} in ShownActor.ts.`);
        return value;
    };
    const admissions = sourceText('packages', 'prismarine', 'src', 'world', 'ChunkAdmissions.ts');
    const lanes = /private static readonly lanes: readonly GenerationPriority\[\] = \[([^\]]*)\]/.exec(admissions)?.[1];
    if (lanes === undefined) throw new Error('The docs facts no longer find the lane rotation in ChunkAdmissions.ts.');
    const turns = (lane: string) => {
        const count = lanes.split(`'${lane}'`).length - 1;
        if (count === 0) throw new Error(`The lane rotation in ChunkAdmissions.ts has no ${lane} turn.`);
        return String(count);
    };
    return {
        'tracking.actorRangeChunks': range('ACTOR_TRACKING_RANGE_CHUNKS'),
        'tracking.itemRangeChunks': range('ITEM_TRACKING_RANGE_CHUNKS'),
        'tick.chunkAdmissionTurns.immediate': turns('immediate'),
        'tick.chunkAdmissionTurns.soon': turns('soon'),
        'tick.chunkAdmissionTurns.idle': turns('idle')
    };
}

/** The rows of each parity family group, such as `parity.families.gameplay`, in declaration order. */
function parityFamilyFacts() {
    const families = sourceText('packages', 'parity', 'src', 'families.ts');
    const body = /export const FAMILIES = \{([\s\S]*?)\n\} as const;/.exec(families)?.[1];
    if (body === undefined) throw new Error('The docs facts no longer find FAMILIES in families.ts.');
    const rows = new Map<string, string[]>();
    for (const [, group, row] of body.matchAll(/: '([a-z][a-z0-9-]*)\.([a-z0-9-]+(?:\.[a-z0-9-]+)*)'/g)) {
        if (group === undefined || row === undefined) continue;
        rows.set(group, [...(rows.get(group) ?? []), row]);
    }
    if (rows.size === 0) throw new Error('The docs facts find no family ids in families.ts.');
    return Object.fromEntries([...rows].map(([group, names]) => [`parity.families.${group}`, names.join(', ')]));
}

/**
 * Values the entity docs and the content README quote, read off the code that decides them: how
 * long the dragon's death goal holds, how many categories the conformance claim excludes, and the
 * methods content packages call on a dimension's entities.
 */
function entityFacts() {
    const specials = sourceText('packages', 'entity-goals', 'src', 'goals', 'specials.ts');
    const deathTicks = /const DRAGON_DEATH_TICKS = (\d+);/.exec(specials)?.[1];
    if (deathTicks === undefined) throw new Error('The docs facts no longer find DRAGON_DEATH_TICKS in specials.ts.');

    const exclusions = sourceText('packages', 'parity', 'src', 'conformance.exclusions.test.ts');
    const excluded = /const EXCLUDED = \[([\s\S]*?)\] as const;/.exec(exclusions)?.[1];
    if (excluded === undefined)
        throw new Error('The docs facts no longer find EXCLUDED in conformance.exclusions.test.ts.');
    const excludedCount = (excluded.match(/\bcategory:/g) ?? []).length;
    if (excludedCount === 0) throw new Error('EXCLUDED in conformance.exclusions.test.ts lists no category.');

    const adapter = sourceText('packages', 'prismarine', 'src', 'content', 'world', 'adapter.ts');
    const access = /export interface ContentEntityAccess \{([\s\S]*?)\n\}/.exec(adapter)?.[1];
    if (access === undefined) throw new Error('The docs facts no longer find ContentEntityAccess in adapter.ts.');
    const methods = [...access.matchAll(/^ {4}(\w+)\(/gm)].flatMap(([, name]) => (name === undefined ? [] : [name]));
    if (methods.length === 0) throw new Error('ContentEntityAccess in adapter.ts declares no method.');

    return {
        'goal.dragonDeathTicks': deathTicks,
        'parity.conformanceExclusions': String(excludedCount),
        // The page wraps the list in inline code, which the facts keep around the value, so the
        // names are joined by the backticks that close one and open the next.
        'content.entitiesApi': methods.join('`, `')
    };
}

/** How often a client e2e server writes its coverage, in seconds. */
function e2eFacts() {
    const exit = sourceText('tools', 'client-e2e', 'src', 'coverage-exit.mjs');
    const milliseconds = /setInterval\(takeCoverage, ([\d_]+)\)/.exec(exit)?.[1];
    if (milliseconds === undefined)
        throw new Error('The docs facts no longer find the coverage interval in coverage-exit.mjs.');
    return { 'e2e.coverageIntervalSeconds': String(Number(milliseconds.replaceAll('_', '')) / 1000) };
}

/** The download cache the data scripts fill, where the generated game data lives. */
const cacheRoot = path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine');

/** Every file under a directory, as paths relative to it. */
function filesUnder(dir: string) {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

/** The JSON files under a directory, parsed. Each is an untyped boundary; callers read named fields. */
function jsonUnder(dir: string): unknown[] {
    return filesUnder(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
}

/** Reads a field off parsed JSON without trusting its shape. */
function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * A group of facts read from one source that may be missing, such as a download the data scripts put
 * in the cache. `read` runs only when `dir` exists.
 */
interface FactSource {
    label: string;
    dir: string;
    names: readonly string[];
    read: (dir: string) => Record<string, number | string> | Promise<Record<string, number | string>>;
}

/** Counts read from the generated game data: the Java datapack and reports, bedrock-samples and BDS. */
function dataSources(sources: Sources): FactSource[] {
    const java = sources.javaServer.defaultVersion;
    const preview = javaPreview(sources);
    return [
        // A preview's format is read only when one is pinned; with none, the main facts say so.
        ...(preview === undefined
            ? []
            : [
                  {
                      label: `the Java ${preview} preview version record`,
                      dir: path.join(cacheRoot, 'vanilla-datapack', preview, 'version.json'),
                      names: ['java.preview.dataPackFormat'],
                      read: (file: string) => ({ 'java.preview.dataPackFormat': recordFormat(file) })
                  }
              ]),
        {
            label: `the Java ${java} vanilla datapack`,
            dir: path.join(cacheRoot, 'vanilla-datapack', java, 'data'),
            names: [
                'java.datapack.files',
                'java.datapack.tags',
                'java.datapack.recipes',
                'java.datapack.lootTables',
                'java.datapack.lootTables.furnaceSmelt',
                'java.datapack.advancements',
                'java.datapack.advancements.recipeRewards',
                'java.datapack.advancements.criteria',
                'java.datapack.advancements.triggers',
                'java.datapack.structures',
                'java.datapack.structures.types',
                'java.datapack.structures.terrainAdaptation',
                'java.datapack.structureSets',
                'java.datapack.templatePools'
            ],
            read: (dir) => {
                const vanilla = path.join(dir, 'minecraft');
                const lootDir = path.join(vanilla, 'loot_table');
                const advancements = jsonUnder(path.join(vanilla, 'advancement'));
                const criteria = advancements.flatMap((advancement) => {
                    const entries = field(advancement, 'criteria');
                    return typeof entries === 'object' && entries !== null ? Object.values(entries) : [];
                });
                const structures = jsonUnder(path.join(vanilla, 'worldgen', 'structure'));
                return {
                    'java.datapack.files': filesUnder(dir).length,
                    'java.datapack.tags': filesUnder(path.join(vanilla, 'tags')).length,
                    'java.datapack.recipes': jsonUnder(path.join(vanilla, 'recipe')).length,
                    'java.datapack.lootTables': jsonUnder(lootDir).length,
                    'java.datapack.lootTables.furnaceSmelt': filesUnder(lootDir).filter((file) =>
                        /"(minecraft:)?furnace_smelt"/.test(readFileSync(path.join(lootDir, file), 'utf8'))
                    ).length,
                    'java.datapack.advancements': advancements.length,
                    'java.datapack.advancements.recipeRewards': advancements.filter((advancement) => {
                        const recipes = field(field(advancement, 'rewards'), 'recipes');
                        return Array.isArray(recipes) && recipes.length > 0;
                    }).length,
                    'java.datapack.advancements.criteria': criteria.length,
                    'java.datapack.advancements.triggers': new Set(criteria.map((entry) => field(entry, 'trigger')))
                        .size,
                    'java.datapack.structures': structures.length,
                    'java.datapack.structures.types': new Set(structures.map((structure) => field(structure, 'type')))
                        .size,
                    'java.datapack.structures.terrainAdaptation': structures.filter(
                        (structure) => field(structure, 'terrain_adaptation') !== undefined
                    ).length,
                    'java.datapack.structureSets': jsonUnder(path.join(vanilla, 'worldgen', 'structure_set')).length,
                    'java.datapack.templatePools': jsonUnder(path.join(vanilla, 'worldgen', 'template_pool')).length
                };
            }
        },
        {
            // The record `datagen:java` writes from the jar's own `version.json`, so the format and
            // JDK a page names are the default release's rather than a number typed beside it.
            label: `the Java ${java} version record`,
            dir: path.join(cacheRoot, 'vanilla-datapack', java, 'version.json'),
            names: ['java.dataPackFormat', 'java.dataVersion', 'java.jdk'],
            read: (file) => {
                const record: unknown = JSON.parse(readFileSync(file, 'utf8'));
                const format = field(record, 'dataPackFormat');
                const dataVersion = field(record, 'dataVersion');
                const jdk = field(record, 'javaVersion');
                if (!Array.isArray(format) || typeof dataVersion !== 'number' || typeof jdk !== 'number')
                    throw new Error(`${file} is not a datagen:java version record`);
                return { 'java.dataPackFormat': format.join('.'), 'java.dataVersion': dataVersion, 'java.jdk': jdk };
            }
        },
        {
            label: `the Java ${java} data reports`,
            dir: path.join(cacheRoot, 'java-reports', java, 'generated', 'reports'),
            names: [
                'java.reports.files',
                'java.reports.blocks',
                'java.reports.blockStates',
                'java.reports.climateBoxes'
            ],
            read: (dir) => {
                const blocks: unknown = JSON.parse(readFileSync(path.join(dir, 'blocks.json'), 'utf8'));
                const blockReports = typeof blocks === 'object' && blocks !== null ? Object.values(blocks) : [];
                const overworld: unknown = JSON.parse(
                    readFileSync(path.join(dir, 'biome_parameters', 'minecraft', 'overworld.json'), 'utf8')
                );
                const boxes = field(overworld, 'biomes');
                return {
                    'java.reports.files': filesUnder(dir).length,
                    'java.reports.blocks': blockReports.length,
                    'java.reports.blockStates': blockReports.reduce<number>((sum, block) => {
                        const states = field(block, 'states');
                        return sum + (Array.isArray(states) ? states.length : 0);
                    }, 0),
                    'java.reports.climateBoxes': Array.isArray(boxes) ? boxes.length : 0
                };
            }
        },
        {
            label: `the Java ${java} structure templates`,
            dir: path.join(cacheRoot, 'java-structures', java),
            names: ['java.templates'],
            read: (dir) => ({ 'java.templates': filesUnder(dir).filter((file) => file.endsWith('.nbt')).length })
        },
        {
            label: `Mojang/bedrock-samples at ${sources.bedrockSamples.tag}`,
            dir: path.join(cacheRoot, 'bedrock-samples', sources.bedrockSamples.tag, 'unpacked'),
            names: ['samples.files'],
            read: (dir) => ({ 'samples.files': filesUnder(dir).length })
        },
        {
            label: 'the composed vanilla Bedrock behavior pack',
            dir: path.join(cacheRoot, 'bds', `v${sources.bds.defaultProtocolVersion}`),
            names: [
                'bedrock.entities',
                'bedrock.tradeTables',
                'bedrock.biomes',
                'bedrock.lootTables.entities',
                'bedrock.lootTables.chests',
                'bedrock.lootTables.blocks'
            ],
            // Composed the way the server composes it, so the counts are what the server loads.
            read: async () => {
                const { load } = await import('../../packages/packs/src/index.ts');
                const { resolvePackStack } = await import('../../packages/prismarine/src/content/packStack.ts');
                const { stack } = resolvePackStack({ overlay: false, javaVanilla: false });
                const { definitions } = load(stack);
                const loot = [...definitions.lootTables.keys()];
                const lootIn = (folder: string) =>
                    loot.filter((key) => key.startsWith(`loot_tables/${folder}/`)).length;
                return {
                    'bedrock.entities': definitions.entities.size,
                    'bedrock.tradeTables': definitions.tradeTables.size,
                    'bedrock.biomes': definitions.biomes.size,
                    'bedrock.lootTables.entities': lootIn('entities'),
                    'bedrock.lootTables.chests': lootIn('chests'),
                    'bedrock.lootTables.blocks': lootIn('blocks')
                };
            }
        },
        {
            label: 'the Java entity attribute and goal captures',
            dir: path.join(repoRoot, 'packages', 'bedrock-data', 'src', 'jsp', 'java', java),
            names: ['java.entityAttributes', 'java.entityGoals'],
            read: (dir) => {
                const attributes: unknown = JSON.parse(readFileSync(path.join(dir, 'entity_attributes.json'), 'utf8'));
                const goals: unknown = JSON.parse(readFileSync(path.join(dir, 'entity_goals.json'), 'utf8'));
                return {
                    'java.entityAttributes':
                        typeof attributes === 'object' && attributes !== null ? Object.keys(attributes).length : 0,
                    'java.entityGoals': typeof goals === 'object' && goals !== null ? Object.keys(goals).length : 0
                };
            }
        },
        {
            label: 'the mapping loss list',
            dir: path.join(repoRoot, 'packages', 'mapping', 'src'),
            names: ['mapping.bedrockBiomeLosses'],
            read: async () => {
                const { BEDROCK_BIOME_LOSSES } = await import('../../packages/mapping/src/lossList.ts');
                return { 'mapping.bedrockBiomeLosses': BEDROCK_BIOME_LOSSES.length };
            }
        },
        {
            label: 'the player overlay',
            dir: path.join(repoRoot, 'packages', 'prismarine', 'src', 'entity'),
            names: ['player.overlayHealth'],
            read: async () => {
                const { PLAYER_OVERLAY_COMPONENTS } =
                    await import('../../packages/prismarine/src/entity/playerOverlay.ts');
                const health = PLAYER_OVERLAY_COMPONENTS['minecraft:health'];
                const value = typeof health === 'object' && health !== null && 'value' in health ? health.value : null;
                if (typeof value !== 'number') throw new Error('the player overlay gives no minecraft:health value');
                return { 'player.overlayHealth': value };
            }
        }
    ];
}

/**
 * Every known fact, by name. A fact whose source is not on disk, such as a download the data scripts
 * have not fetched in this checkout, is present with a `null` value: markers for it keep their text.
 */
/** The table format `@jsprismarine/leveldb` reads and writes, read off its constants and defaults. */
function leveldbFacts() {
    return {
        'leveldb.readCompression': list(Object.values(CompressionType).map(String)),
        'leveldb.writtenCompression': String(resolveOptions().compression),
        'leveldb.blockSize': `${DEFAULT_BLOCK_SIZE / 1024} KiB`
    };
}

/** The folder of JSPrismarine's own addons. */
const REPO_ADDONS_DIRECTORY = path.join(repoRoot, 'addons');

/** The name of each of JSPrismarine's own addons, which is its folder's under `addons/`. */
export const addonNames = () =>
    readdirSync(REPO_ADDONS_DIRECTORY, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name);

/** A sample pack's entry in an index, its URL on the source's release as the build writes it. */
const sampleIndexEntry = (source: string, name: string, version: string, minServer: string) => ({
    name,
    version,
    description: 'Shows TPS, MSPT and ping on a boss bar.',
    minServer,
    url: `${releaseDownloadUrl(source)}/${packFileName(name, version)}`,
    sha256: "<the pack's SHA-256>"
});

/**
 * The addon layout and index that `@jsprismarine/addon-tools` checks and writes, the files and
 * command a server installs with, and the catalog of JSPrismarine's own addons.
 */
async function addonFacts() {
    const command = (await loadServerCommands()).find(({ name }) => name === 'addon');
    if (!command) throw new Error('The docs facts no longer find the console command that installs addons.');
    // Parsed JSON is an untyped boundary; only the command names are read.
    const toolsManifest: { name: string; bin: Record<string, string> } = JSON.parse(
        sourceText('packages', 'addon-tools', 'package.json')
    );
    const [cli] = Object.keys(toolsManifest.bin);
    const inputs = releaseWorkflowInputs();
    const input = (name: string) => {
        const found = inputs.find((each) => each.name === name);
        if (!found) throw new Error(`The addons release workflow no longer takes the ${name} input.`);
        return found;
    };
    const { version: serverVersion } = loadProject();
    const otherSource = 'someone/their-addons';
    const requested = {
        addons: {
            'tps-bar': { source: DEFAULT_ADDON_SOURCE, version: '^1.0.0' },
            'their-tps-bar': { source: otherSource, name: 'tps-bar', version: '^2.1.0' },
            'my-addon': { path: '../my-addon' }
        }
    } satisfies AddonsFile;
    const tpsBar = sampleIndexEntry(DEFAULT_ADDON_SOURCE, 'tps-bar', '1.0.0', serverVersion);
    const theirs = sampleIndexEntry(otherSource, 'tps-bar', '2.1.3', serverVersion);
    const lock = {
        lockfileVersion: ADDONS_LOCKFILE_VERSION,
        addons: {
            'tps-bar': {
                source: DEFAULT_ADDON_SOURCE,
                name: 'tps-bar',
                version: '1.0.0',
                url: tpsBar.url,
                sha256: tpsBar.sha256
            },
            'their-tps-bar': {
                source: otherSource,
                name: 'tps-bar',
                version: '2.1.3',
                url: theirs.url,
                sha256: theirs.sha256
            },
            'my-addon': { path: '../my-addon', name: 'my-addon', version: '0.1.0' }
        }
    } satisfies AddonsLockFile;
    return {
        'addons.catalog': addonCatalog(await loadAddons(), command.name),
        'addons.files': list(ADDON_FILES.map(inlineCode)),
        'addons.moduleTypes': list(ADDON_MODULE_TYPES.map(inlineCode)),
        'addons.releaseTag': inlineCode(ADDON_RELEASE_TAG),
        'addons.indexFile': inlineCode(ADDON_INDEX_FILE),
        'addons.indexSchemaVersion': inlineCode(String(ADDON_INDEX_SCHEMA_VERSION)),
        'addons.requestFile': inlineCode(ADDONS_FILE),
        'addons.lockFile': inlineCode(ADDONS_LOCK_FILE),
        'addons.lockfileVersion': inlineCode(String(ADDONS_LOCKFILE_VERSION)),
        'addons.directory': inlineCode(`${ADDONS_DIRECTORY}/`),
        'addons.defaultSource': inlineCode(DEFAULT_ADDON_SOURCE),
        // Plain, since the docs build also reads it to write each addon's install command.
        'addons.command': command.name,
        'addons.installExample': `${command.name} install <name>`,
        // The TPS bar's manifest with its UUIDs left for the author to generate, so the example's
        // engine and Script API versions stay the ones the addon declares.
        'addons.manifestExample': readFileSync(path.join(REPO_ADDONS_DIRECTORY, 'tps-bar', 'manifest.json'), 'utf8')
            .trimEnd()
            .replace(/"uuid": "[0-9a-f-]+"/, '"uuid": "<a new UUID>"')
            .replaceAll(/"uuid": "[0-9a-f-]+"/g, '"uuid": "<another new UUID>"'),
        'addons.commandLevel': String(command.level),
        'addons.commandPermission': inlineCode(command.permission),
        'addons.requestExample': serializeAddonsFile(requested).trimEnd(),
        'addons.lockExample': serializeAddonsLockFile(lock).trimEnd(),
        'addons.indexExample': serializeAddonIndex(
            createAddonIndex([tpsBar, sampleIndexEntry(DEFAULT_ADDON_SOURCE, 'tps-bar', '1.1.0', serverVersion)])
        ).trimEnd(),
        // Where `addon install <owner>/<repo>/<name>` reads a source's index.
        'addons.indexUrl': inlineCode(`${releaseDownloadUrl('<owner>/<repo>')}/${ADDON_INDEX_FILE}`),
        'addons.cli': inlineCode(cli ?? ''),
        'addons.cliUsage': ADDON_TOOLS_USAGE.trimEnd(),
        'addons.workflowPath': inlineCode(releaseWorkflow),
        // A repository of addons calling the reusable workflow. GitHub reads `uses` as a literal,
        // so the example names the commit to pin instead of a value.
        'addons.callerExample': [
            'name: Addons',
            '',
            'on:',
            '    pull_request:',
            '    push:',
            '        branches: [main]',
            '',
            "# One publish at a time: two at once would each upload an index that lacks the other's packs.",
            'concurrency:',
            '    group: ${{ github.workflow }}-${{ github.ref }}',
            "    cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
            '',
            'jobs:',
            '    addons:',
            `        uses: ${DEFAULT_ADDON_SOURCE}/${releaseWorkflow}@<commit sha>`,
            '        permissions:',
            '            contents: write',
            '        with:',
            `            ${input('publish').name}: \${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}`
        ].join('\n'),
        'addons.workflowInputs': `\n${table(
            ['Input', 'Type', 'Default', 'What it does'],
            inputs.map((each) => [
                inlineCode(each.name),
                each.type,
                each.default === undefined ? (each.required ? 'required' : 'none') : inlineCode(each.default),
                each.description
            ])
        )}\n`,
        // The default of `tools`, which a caller outside JSPrismarine's repository runs.
        'addons.toolsDefault': inlineCode(input('tools').default ?? ''),
        'addons.publishDefault': inlineCode(input('publish').default ?? ''),
        'addons.foldersDefault': inlineCode(input('addons').default ?? ''),
        ...Object.fromEntries(
            addonNames().map((name) => {
                // Parsed JSON is an untyped boundary; `jsp-addon build` checks the file's shape.
                const { minServer } = JSON.parse(
                    readFileSync(path.join(REPO_ADDONS_DIRECTORY, name, 'addon.json'), 'utf8')
                );
                return [`addons.${name}.minServer`, String(minServer)];
            })
        )
    };
}

/** A list of numbers that an addon's script module exports, checked, since the module is plain JavaScript. */
const exportedNumbers = (module: object, name: string): readonly number[] => {
    const value: unknown = Reflect.get(module, name);
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'number'))
        throw new Error(`the addon module exports no list of numbers as ${name}`);
    return value;
};

/** The TPS bar's color thresholds and full bar, read from the module that draws the bar. */
async function tpsBarFacts() {
    const bar: object = await import(
        pathToFileURL(path.join(REPO_ADDONS_DIRECTORY, 'tps-bar', 'scripts', 'bar.js')).href
    );
    const [tpsGreen, tpsGold] = exportedNumbers(bar, 'TPS_LEVELS');
    const [msptGreen, msptGold] = exportedNumbers(bar, 'MSPT_LEVELS');
    const budget: unknown = Reflect.get(bar, 'TICK_BUDGET_MS');
    return {
        'addons.tps-bar.levels': `\n${table(
            ['Number', 'Green', 'Gold', 'Red'],
            [
                ['TPS', `${tpsGreen} or more`, `${tpsGold} or more`, `below ${tpsGold}`],
                ['MSPT', `below ${msptGreen}`, `below ${msptGold}`, `${msptGold} or more`]
            ]
        )}\n`,
        'addons.tps-bar.tickBudget': String(budget)
    };
}

/** The standard placeholders addon's namespaces and keys, read from the module that lists them. */
async function standardPlaceholdersFacts() {
    const module: object = await import(
        pathToFileURL(path.join(REPO_ADDONS_DIRECTORY, 'standard-placeholders', 'scripts', 'placeholders.js')).href
    );
    const namespaces: unknown = Reflect.get(module, 'PLACEHOLDERS');
    if (typeof namespaces !== 'object' || namespaces === null) {
        throw new Error('the standard placeholders addon exports no PLACEHOLDERS table');
    }
    const rows = Object.entries(namespaces).flatMap(([namespace, keys]) => {
        if (typeof keys !== 'object' || keys === null) throw new Error(`${namespace} lists no keys`);
        return Object.entries(keys).map(([key, summary]) => [inlineCode(`{${namespace}:${key}}`), String(summary)]);
    });
    return { 'addons.standard-placeholders.keys': `\n${table(['Token', 'What it renders'], rows)}\n` };
}

/** The entry points `@jsprismarine/prismarine` publishes, read from its published exports map. */
function prismarineEntryFacts() {
    // Parsed JSON is an untyped boundary; only the published exports map is read.
    const manifest: { publishConfig: { exports: Record<string, unknown> } } = JSON.parse(
        sourceText('packages', 'prismarine', 'package.json')
    );
    const specifiers = Object.keys(manifest.publishConfig.exports)
        .filter((key) => key !== './package.json')
        .map((key) => (key === '.' ? '@jsprismarine/prismarine' : `@jsprismarine/prismarine/${key.slice(2)}`));
    if (!specifiers.length) throw new Error('The docs facts no longer find the exports Prismarine publishes.');
    return {
        'prismarine.entryPoints.count': String(specifiers.length),
        'prismarine.entryPoints.list': specifiers.join('\n')
    };
}

export interface Facts {
    values: ReadonlyMap<string, string | null>;
    /** The sources that were not on disk, by label. */
    missing: readonly string[];
}

/** Every fact, by name. A marker naming any other fact fails the docs build. */
export async function loadFacts(): Promise<Facts> {
    const project = loadProject();
    // Parsed JSON is an untyped boundary; only the fields `Sources` names are read.
    const sources: Sources = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
    );
    const bds = sources.bds.versions[sources.bds.defaultProtocolVersion];
    const javaJar = sources.javaServer.versions[sources.javaServer.defaultVersion];
    const newest = project.protocols[0];
    const oldest = project.protocols.at(-1) ?? newest;
    const minecraft = project.protocols.toReversed().flatMap(({ minecraft }) => minecraft);

    const values = new Map<string, string | null>(
        Object.entries({
            'server.version': project.version,
            'server.port': String(project.defaultPort),
            'demo.address': project.demo.address,
            'demo.port': String(project.demo.port),
            'demo.sponsor': project.demo.sponsor.name,
            'demo.discount': project.demo.sponsor.discount,
            // A whole Markdown link, since a marker cannot sit inside a link's target.
            'demo.sponsorLink': `[${project.demo.sponsor.url.replace(/^https?:\/\//, '')}](${project.demo.sponsor.url})`,
            'nethernet.lanPort': String(project.netherNetLanPort),
            'nethernet.identityFile': project.netherNetIdentityFile,
            'server.onlineMode': project.onlineMode ? 'on' : 'off',
            'node.minimum': project.engines.node.replace(/^>=\s*/, ''),
            'pnpm.minimum': project.engines.pnpm.replace(/^>=\s*/, ''),
            'packages.count': String(project.packages.length),
            'executables.count': String(project.executables.length),
            'protocol.newest': String(newest.protocol),
            'protocol.oldest': String(oldest.protocol),
            'protocol.list': list(project.protocols.map(({ protocol }) => String(protocol))),
            'minecraft.newest': minecraft.at(-1) ?? '',
            'minecraft.oldest': minecraft[0] ?? '',
            // What a server with the default protocol window accepts.
            'minecraft.newestRelease':
                newest.minecraft.length > 1
                    ? `${newest.minecraft[0]} through ${newest.minecraft.at(-1)}`
                    : (newest.minecraft[0] ?? ''),
            // A whole sentence, since whether there is a preview at all changes what it says.
            'minecraft.previewNote': project.preview
                ? `It also accepts Minecraft Preview ${project.preview.minecraft.join(', ')} on protocol ${project.preview.protocol}, which the server list does not show.`
                : 'It accepts no Minecraft Preview.',
            'bds.version': bds.serverVersion,
            'bds.minecraft': bds.minecraftVersion,
            'bds.size': megabytes(bds.sizeInBytes),
            // The packaged server's download cache, written with each platform's placeholders.
            'cache.windows': userCacheDir({ LOCALAPPDATA: '%LOCALAPPDATA%' }, 'win32', '%USERPROFILE%'),
            'cache.macos': userCacheDir({}, 'darwin', '~'),
            'cache.xdg': userCacheDir({ XDG_CACHE_HOME: '$XDG_CACHE_HOME' }, 'linux', '~'),
            'cache.linux': userCacheDir({}, 'linux', '~'),
            'samples.tag': sources.bedrockSamples.tag,
            'java.version': sources.javaServer.defaultVersion,
            'java.size': megabytes(javaJar.sizeInBytes),
            'java.preview.version': javaPreview(sources) ?? 'none',
            ...(javaPreview(sources) === undefined ? { 'java.preview.dataPackFormat': 'none' } : {}),
            // The body of a `content-java-version` example naming a pinned release, the preview when
            // there is one. The page keeps the fenced block around it.
            'java.configExample': JSON.stringify(
                { 'content-java-version': javaPreview(sources) ?? sources.javaServer.defaultVersion },
                undefined,
                4
            ),
            ...Object.fromEntries(Object.entries(palette).map(([name, { hex }]) => [`palette.${name}`, hex])),
            // The styles a page's `image` front matter may ask its link preview card for.
            'og.cardStyles': cardStyles.map((style) => `\`${style}\``).join(' or '),
            'brand.components': `\n${table(
                ['Component', 'Purpose'],
                Object.entries(brandPurposes).map(([name, purpose]) => [`\`${name}\``, purpose])
            )}\n`,
            ...(await commandFacts()),
            ...(await commandReferenceFacts()),
            ...(await errorFacts()),
            ...(await configFacts()),
            ...(await bstatsFacts()),
            // The ids a `worlds.<name>` entry's `experiments` accepts.
            'world.experiments': WORLD_EXPERIMENTS.join(', '),
            // The one a pack that declares a beta Script API version needs.
            'world.betaApis': BETA_APIS,
            // The port `/script debugger listen` and `connect` use when given none.
            'scripting.debuggerPort': String(DEFAULT_DEBUGGER_PORT),
            ...scriptingFacts(),
            ...eventFacts(),
            ...prismarineEntryFacts(),
            ...(await addonFacts()),
            ...(await tpsBarFacts()),
            ...(await standardPlaceholdersFacts()),
            ...leveldbFacts(),
            ...tickBudgetFacts(),
            ...generationFacts(),
            ...fluidFacts(),
            ...replicationFacts(),
            ...blendingFacts(),
            ...parityFamilyFacts(),
            ...e2eFacts(),
            ...entityFacts()
        })
    );
    const missing: string[] = [];
    for (const source of dataSources(sources)) {
        if (!existsSync(source.dir)) {
            missing.push(source.label);
            for (const name of source.names) values.set(name, null);
            continue;
        }
        for (const [name, count] of Object.entries(await source.read(source.dir))) values.set(name, String(count));
    }
    return { values, missing };
}

/**
 * A marker with its name and the text it wraps. Names are dotted words, such as `node.minimum`. A
 * marker right after a backtick is an example written in inline code, and is left alone.
 */
const MARKER = /(?<!`)<!-- fact:([\w.-]+) -->([\s\S]*?)<!-- \/fact -->/g;

/** Puts a fact's value in place of the marked text, keeping inline code or a fenced block around it. */
function replaceValue(marked: string, value: string) {
    const fence = /^(\s*)(```+)([^\n]*)\n[\s\S]*?\n\2(\s*)$/.exec(marked);
    if (fence) return `${fence[1]}${fence[2]}${fence[3]}\n${value}\n${fence[2]}${fence[4]}`;
    const code = /^(`+)[\s\S]*\1$/.exec(marked);
    // A value written as Markdown code already, such as a list of `values`, keeps its own backticks.
    if (code && !/^`[\s\S]*`$/.test(value)) return `${code[1]}${value}${code[1]}`;
    return value;
}

/** What applying facts to a page did. */
export interface FactsResult {
    text: string;
    /** Marker names with no fact behind them. */
    unknown: string[];
    /** Facts whose marked text in the source differs from the current value. */
    stale: { name: string; was: string; now: string }[];
    /** Facts whose source is not on disk, so their marked text was kept as written. */
    unavailable: string[];
}

/**
 * Fills every marked value in `markdown` with its current fact. `keepMarkers` leaves the comments in,
 * for writing back to the source; without it the markers go, for the published page.
 */
export function applyFacts(
    markdown: string,
    facts: ReadonlyMap<string, string | null>,
    { keepMarkers = false } = {}
): FactsResult {
    const unknown: string[] = [];
    const stale: FactsResult['stale'] = [];
    const unavailable: string[] = [];
    const text = markdown.replace(MARKER, (whole, name: string, marked: string) => {
        const value = facts.get(name);
        if (value === undefined) {
            unknown.push(name);
            return whole;
        }
        if (value === null) unavailable.push(name);
        const filled = value === null ? marked : replaceValue(marked, value);
        if (filled !== marked) stale.push({ name, was: marked.trim(), now: filled.trim() });
        return keepMarkers ? `<!-- fact:${name} -->${filled}<!-- /fact -->` : filled;
    });
    return { text, unknown, stale, unavailable };
}
