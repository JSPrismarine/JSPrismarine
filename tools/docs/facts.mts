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
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { palette } from './site/.vitepress/theme/tokens.ts';
import { loadProject, repoRoot } from './project.mts';

/** Pinned downloads in `packages/bedrock-data/sources.json`, as far as the docs quote them. */
interface Sources {
    bds: {
        defaultProtocolVersion: number;
        versions: Record<string, { minecraftVersion: string; serverVersion: string; sizeInBytes: number }>;
    };
    bedrockSamples: { tag: string };
    javaServer: { version: string; sizeInBytes: number };
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
function table(header: readonly string[], rows: readonly (readonly string[])[]) {
    const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map((row) => row[column].length)));
    const line = (cells: readonly string[]) =>
        `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
    return [line(header), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

/**
 * The commands `@jsprismarine/commands` implements and the ones this server registers. Read by running
 * the same registration the server runs, so it needs a TypeScript loader (`node --import tsx`).
 */
async function commandFacts() {
    const commands = await import('../../packages/commands/src/index.ts');
    const server = await import('../../packages/prismarine/src/command/vanillaCommands.ts');
    const all = new commands.CommandRegistry();
    commands.registerVanillaCommands(all);
    const registered = server.buildVanillaCommands().getNames();
    const unwired = Object.entries(server.UNWIRED_COMMANDS);
    return {
        'commands.implemented': String(all.getNames().length),
        'commands.registered': String(registered.length),
        'commands.unwired': String(unwired.length),
        'commands.unwired.example': `/${unwired[0]?.[0] ?? ''}`,
        // Surrounded by blank lines so the table stays its own block between the markers.
        'commands.unwired.table': `\n${table(
            ['Command', 'What it would need'],
            unwired.map(([name, reason]) => [`\`/${name}\``, reason])
        )}\n`,
        'commands.registered.list': wrap(registered)
    };
}

/** Every fact, by name. A marker naming any other fact fails the docs build. */
export async function loadFacts(): Promise<Map<string, string>> {
    const project = loadProject();
    // Parsed JSON is an untyped boundary; only the fields `Sources` names are read.
    const sources: Sources = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
    );
    const bds = sources.bds.versions[sources.bds.defaultProtocolVersion];
    const newest = project.protocols[0];
    const oldest = project.protocols.at(-1) ?? newest;
    const minecraft = project.protocols.toReversed().flatMap(({ minecraft }) => minecraft);

    return new Map(
        Object.entries({
            'server.version': project.version,
            'server.port': String(project.defaultPort),
            'node.minimum': project.engines.node.replace(/^>=\s*/, ''),
            'pnpm.minimum': project.engines.pnpm.replace(/^>=\s*/, ''),
            'packages.count': String(project.packages.length),
            'executables.count': String(project.executables.length),
            'protocol.newest': String(newest.protocol),
            'protocol.oldest': String(oldest.protocol),
            'protocol.list': list(project.protocols.map(({ protocol }) => String(protocol))),
            'minecraft.newest': minecraft.at(-1) ?? '',
            'minecraft.oldest': minecraft[0] ?? '',
            'bds.version': bds.serverVersion,
            'bds.minecraft': bds.minecraftVersion,
            'bds.size': megabytes(bds.sizeInBytes),
            'samples.tag': sources.bedrockSamples.tag,
            'java.version': sources.javaServer.version,
            'java.size': megabytes(sources.javaServer.sizeInBytes),
            ...Object.fromEntries(Object.entries(palette).map(([name, { hex }]) => [`palette.${name}`, hex])),
            ...(await commandFacts())
        })
    );
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
    if (code) return `${code[1]}${value}${code[1]}`;
    return value;
}

/** What applying facts to a page did. */
export interface FactsResult {
    text: string;
    /** Marker names with no fact behind them. */
    unknown: string[];
    /** Facts whose marked text in the source differs from the current value. */
    stale: { name: string; was: string; now: string }[];
}

/**
 * Fills every marked value in `markdown` with its current fact. `keepMarkers` leaves the comments in,
 * for writing back to the source; without it the markers go, for the published page.
 */
export function applyFacts(markdown: string, facts: Map<string, string>, { keepMarkers = false } = {}): FactsResult {
    const unknown: string[] = [];
    const stale: FactsResult['stale'] = [];
    const text = markdown.replace(MARKER, (whole, name: string, marked: string) => {
        const value = facts.get(name);
        if (value === undefined) {
            unknown.push(name);
            return whole;
        }
        const filled = replaceValue(marked, value);
        if (filled !== marked) stale.push({ name, was: marked.trim(), now: filled.trim() });
        return keepMarkers ? `<!-- fact:${name} -->${filled}<!-- /fact -->` : filled;
    });
    return { text, unknown, stale };
}
