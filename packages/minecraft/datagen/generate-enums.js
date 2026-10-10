/**
 * Turns Mojang's published protocol documentation into the enums this package exports.
 *
 * Run with `pnpm generate`, or `pnpm generate --compare` to see what would change without
 * writing anything - which is how a version bump gets reviewed before it is taken.
 *
 * Nothing here decides anything. Which release to read, which enums are public and what they
 * are called all live in `manifest.json`; this only applies them. A change in behaviour
 * should be a change in that file.
 *
 * Two documents are read. `snapshot/enums.json` is the release this package targets, as
 * `import-schemas.js` extracted it from Mojang's JSON schemas; it is the source for every
 * enum it has. `enums.html`, the last HTML dump Mojang published, is the source for the rest:
 * a schema exists only for a type a packet field is declared with, and some of the enums
 * this package exports travel as plain integers.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { parseEnums } from './parse.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const MANIFEST = path.join(HERE, 'manifest.json');
const SRC_DIR = path.join(HERE, '..', 'src');
const OUT_DIR = path.join(SRC_DIR, 'generated');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

/**
 * The document, from the local copy if it is the one the manifest pins.
 *
 * Fetched at most once and kept, because the branch it came from will not be there forever:
 * Mojang keeps a rolling window and the docs for a given version are eventually deleted.
 * The cached file is the artefact; the network is only how it first arrived.
 */
const readSource = async () => {
    const cache = path.join(HERE, 'snapshot', path.basename(manifest.source.path));
    const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

    if (fs.existsSync(cache)) {
        const cached = fs.readFileSync(cache);
        if (digest(cached) === manifest.source.sha256) return cached.toString('utf8');

        throw new Error(
            `${cache} does not match the hash in the manifest. Delete it to fetch again, or ` +
                `update the manifest if the change is intended.`
        );
    }

    const url = `https://raw.githubusercontent.com/${manifest.source.repo}/${manifest.source.ref}/${manifest.source.path}`;
    console.log(`Fetching ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);

    const body = Buffer.from(await response.arrayBuffer());
    const got = digest(body);
    if (got !== manifest.source.sha256) {
        throw new Error(
            `Fetched ${manifest.source.path} hashes to ${got}, the manifest says ` +
                `${manifest.source.sha256}. Either the branch moved under us or the manifest is stale.`
        );
    }

    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, body);
    return body.toString('utf8');
};

/**
 * The enums of the targeted release, from the schema extract, by upstream name.
 *
 * The extract carries its own provenance and says which of the manifest's enums it could
 * not find; those, and only those, come from the HTML dump.
 */
const readSchemaExtract = () => {
    const file = path.join(HERE, 'snapshot', 'enums.json');
    if (!fs.existsSync(file)) {
        throw new Error(
            `Missing ${file}. Run \`pnpm generate:import\` to extract it from the release the manifest pins.`
        );
    }

    const extract = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (extract.networkProtocolVersion !== manifest.schemas.networkProtocolVersion) {
        throw new Error(
            `${file} is for protocol ${extract.networkProtocolVersion}, the manifest pins ` +
                `${manifest.schemas.networkProtocolVersion}. Run \`pnpm generate:import\`.`
        );
    }

    return {
        enums: new Map(Object.entries(extract.enums).map(([name, { members }]) => [name, members])),
        absent: new Set(extract.absent)
    };
};

/**
 * Mojang's member names into the shape this codebase uses.
 *
 * They arrive in two dialects - `SoundClickFail` and `item.use.on` - and both become
 * `SOUND_CLICK_FAIL` and `ITEM_USE_ON`. A leading digit is prefixed rather than dropped:
 * `9800` is a real member name, and `_9800` is what the hand-written enum already calls it.
 */
export const toIdentifier = (name) => {
    const upper = name
        .replaceAll(/[.\-\s]+/g, '_')
        .replaceAll(/([a-z\d])([A-Z])/g, '$1_$2')
        .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
        .toUpperCase()
        .replaceAll(/_+/g, '_')
        .replace(/^_|_$/g, '');

    return /^\d/.test(upper) ? `_${upper}` : upper;
};

/**
 * The TypeScript for one enum, members in the order the document gave them.
 *
 * Two kinds of exception come from the manifest, and both exist so that adopting a generated
 * enum does not mean renaming every call site:
 *
 * - `aliases` rename a documented member. Vanilla's own name is not always the one this
 *   codebase has used for years, and the value is what matters.
 * - `extras` add members the document does not carry - a sentinel of our own, or a value a
 *   second source documents and Mojang's does not.
 * - `skip` drops members that are not protocol at all: the dump includes preprocessor
 *   directives (`ifdef`, `endif`) as if they were values.
 * - `names` also emits the member names exactly as the document spells them, keyed by value.
 *   Some of these enums travel as a *string* rather than a number - `LevelSoundEventPacket`
 *   names its sound rather than numbering it since 1.21.130 - and the identifier this
 *   generator makes (`ITEM_USE_ON`) is not what goes on the wire (`item.use.on`).
 */
const render = (name, mojangName, members, provenance, rules = {}) => {
    const { aliases = {}, extras = {}, skip = [], names = false } = rules;
    const seen = new Set();
    const lines = [];

    for (const member of members) {
        if (skip.includes(member.name)) continue;

        const identifier = aliases[member.name] ?? toIdentifier(member.name);
        // Vanilla gives several members the same name once normalised - and sometimes the
        // same name twice outright. The first wins, and the rest are recorded rather than
        // dropped in silence.
        if (seen.has(identifier)) {
            lines.push(`    // ${identifier} = ${member.value}, // duplicate of an earlier member`);
            continue;
        }

        seen.add(identifier);
        lines.push(`    ${identifier} = ${member.value},`);
    }

    for (const [identifier, value] of Object.entries(extras)) {
        if (seen.has(identifier)) continue;

        seen.add(identifier);
        lines.push(`    ${identifier} = ${value},`);
    }

    // The repository formats with no trailing comma, and generated output that needs
    // reformatting is output that invites someone to reformat it.
    const last = lines.findLastIndex((line) => !line.trimStart().startsWith('//'));
    if (last !== -1) lines[last] = lines[last].replace(/,$/, '');

    const nameTable = [];
    if (names) {
        const byValue = new Map();
        for (const member of members) {
            if (skip.includes(member.name)) continue;
            if (!byValue.has(member.value)) byValue.set(member.value, member.name);
        }

        nameTable.push(
            '',
            '/**',
            ` * The name each ${name} travels under when it is written as a string rather than a`,
            ' * number, spelled exactly as the documentation spells it.',
            ' */',
            `export const ${name}Name: Readonly<Record<number, string>> = {`,
            ...[...byValue].map(([value, member]) => `    ${value}: ${JSON.stringify(member)},`),
            '};',
            ''
        );

        const lastEntry = nameTable.findLastIndex((line) => line.trimStart().startsWith(`${''}`) && line.endsWith(','));
        if (lastEntry !== -1) nameTable[lastEntry] = nameTable[lastEntry].replace(/,$/, '');
    }

    return `${[
        '/**',
        ` * ${name}, from Mojang's published protocol documentation.`,
        ' *',
        ' * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.',
        ` * Source: ${provenance}`,
        ` * Upstream name: ${mojangName}`,
        ' */',
        `export enum ${name} {`,
        ...lines,
        '}',
        ...nameTable,
        ''
    ].join('\n')}`;
};

/**
 * The hand-written enum in `src`, as names to values.
 *
 * Only literal members are read, implicit ones counted the way TypeScript does. An
 * expression member - `WORLD_DEFAULT = SURVIVAL` - is skipped rather than guessed at, which
 * is why this is a comparison aid and not a parser anybody should rely on.
 */
const readHandWritten = (name) => {
    const file = path.join(SRC_DIR, `${name}.ts`);
    if (!fs.existsSync(file)) return null;

    const source = fs.readFileSync(file, 'utf8');

    // A file that only re-exports the generated one has nothing to compare: it *is* the
    // generated one. Without this the re-export line reads as a member named after the enum,
    // and every adopted enum reports a difference against itself.
    if (!/export\s+(?:const\s+)?enum\s/.test(source)) return null;

    const body = source.slice(source.indexOf('{') + 1, source.lastIndexOf('}'));

    const members = new Map();
    let next = 0;

    for (const raw of body.split('\n')) {
        const line = raw
            .replaceAll(/\/\/.*$/g, '')
            .replaceAll(/\/\*[\s\S]*?\*\//g, '')
            .trim()
            .replace(/,$/, '');

        const match = /^([A-Za-z_]\w*)\s*(?:=\s*(-?\d+))?$/.exec(line);
        if (!match) continue;

        const value = match[2] === undefined ? next : Number(match[2]);
        members.set(match[1], value);
        next = value + 1;
    }

    return members;
};

/**
 * Reports how the hand-written enums differ from the documented ones.
 *
 * Read with the versions in mind: the manifest pins whichever release Mojang still publishes,
 * which is not necessarily the one this server speaks. A member missing upstream is usually
 * something vanilla removed since; a member whose **value** moved is either drift worth
 * knowing about or a hand-written mistake, and only a human can say which.
 */
const verify = (enums) => {
    let differences = 0;

    for (const [name, mojangName] of publicEnums()) {
        const hand = readHandWritten(name);
        if (!hand) {
            console.log(`${name.padEnd(28)} no hand-written counterpart`);
            continue;
        }

        const rules = (manifest.rules ?? {})[name] ?? {};
        const documented = new Map();
        for (const member of enums.get(mojangName)) {
            if ((rules.skip ?? []).includes(member.name)) continue;

            const identifier = rules.aliases?.[member.name] ?? toIdentifier(member.name);
            if (!documented.has(identifier)) documented.set(identifier, member.value);
        }
        for (const [identifier, value] of Object.entries(rules.extras ?? {})) {
            if (!documented.has(identifier)) documented.set(identifier, value);
        }

        const notes = [];
        for (const [member, value] of hand) {
            if (!documented.has(member)) notes.push(`  absent upstream   ${member} = ${value}`);
            else if (documented.get(member) !== value) {
                notes.push(`  VALUE DIFFERS     ${member}: ours ${value}, documented ${documented.get(member)}`);
            }
        }

        differences += notes.length;
        console.log(
            `${name.padEnd(28)} ours ${String(hand.size).padStart(3)}  documented ${String(documented.size).padStart(3)}  ` +
                (notes.length === 0 ? 'agrees' : `${notes.length} difference(s)`)
        );
        for (const note of notes) console.log(note);
    }

    console.log(`\n${differences} difference(s) across ${publicEnums().length} enum(s).`);
};

/** The enums the manifest declares public, minus its comment keys. */
const publicEnums = () => Object.entries(manifest.enums).filter(([name]) => !name.startsWith('$'));

const main = async () => {
    const compareOnly = process.argv.includes('--compare');
    const verifyOnly = process.argv.includes('--verify');

    const html = await readSource();
    const legacy = parseEnums(html);

    // Fail closed. A document that has changed shape yields fewer enums, and the wrong answer
    // to "how many" is a reason to stop rather than to write a small, plausible diff.
    if (legacy.size < manifest.thresholds.minEnums) {
        throw new Error(
            `Only ${legacy.size} enums parsed, the manifest expects at least ` +
                `${manifest.thresholds.minEnums}. Refusing to generate from this.`
        );
    }

    const schemas = readSchemaExtract();

    // The targeted release wins wherever it has an answer; the HTML dump fills in the rest,
    // and only for the enums the extract says it looked for and could not find.
    const enums = new Map();
    const provenanceOf = new Map();
    const schemaProvenance = `${manifest.schemas.repo} release ${manifest.schemas.release} (Minecraft ${manifest.schemas.minecraftVersion}, protocol ${manifest.schemas.networkProtocolVersion})`;
    const legacyProvenance = `${manifest.source.repo}@${manifest.source.ref} (Minecraft ${manifest.source.minecraftVersion}, protocol ${manifest.source.networkProtocolVersion}; no schema in ${manifest.schemas.release})`;
    for (const [, mojangName] of publicEnums()) {
        if (schemas.enums.has(mojangName)) {
            enums.set(mojangName, schemas.enums.get(mojangName));
            provenanceOf.set(mojangName, schemaProvenance);
        } else if (schemas.absent.has(mojangName) && legacy.has(mojangName)) {
            enums.set(mojangName, legacy.get(mojangName));
            provenanceOf.set(mojangName, legacyProvenance);
        }
    }

    const wanted = publicEnums();
    const missing = wanted.filter(([, mojangName]) => !enums.has(mojangName));
    if (missing.length > 0) {
        throw new Error(
            `The manifest asks for enums neither document has: ` +
                `${missing.map(([name, from]) => `${name} (${from})`).join(', ')}`
        );
    }

    if (verifyOnly) return verify(enums);

    if (!compareOnly) fs.mkdirSync(OUT_DIR, { recursive: true });

    for (const [name, mojangName] of wanted) {
        const members = enums.get(mojangName);
        if (members.length < manifest.thresholds.minMembersPerEnum) {
            throw new Error(`${mojangName} has ${members.length} member(s), which is too few to be right.`);
        }

        const source = render(name, mojangName, members, provenanceOf.get(mojangName), (manifest.rules ?? {})[name]);
        const target = path.join(OUT_DIR, `${name}.ts`);

        if (compareOnly) {
            const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
            const state = existing === null ? 'new' : existing === source ? 'unchanged' : 'CHANGED';
            console.log(`  ${state.padEnd(9)} ${name}  (${members.length} members)`);
            continue;
        }

        fs.writeFileSync(target, source);
        console.log(`  ${name}  ${members.length} members`);
    }

    console.log(
        compareOnly
            ? `\nCompared ${wanted.length} enum(s) against ${OUT_DIR}. Nothing written.`
            : `\nWrote ${wanted.length} enum(s) to ${OUT_DIR}.`
    );
};

// Only when run, never when imported: `toIdentifier` is exported for tests, and importing it
// used to execute the whole generator as a side effect - which wrote files nobody asked for.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) await main();
