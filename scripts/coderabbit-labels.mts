/**
 * Checks `.github/labels.yml` and generates CodeRabbit's labeling instructions in
 * `.coderabbit.yaml` from it.
 *
 *   node scripts/coderabbit-labels.mts                    update .coderabbit.yaml
 *   node scripts/coderabbit-labels.mts --check            fail when .coderabbit.yaml is out of date
 *   node scripts/coderabbit-labels.mts --manifest <file>  write the catalog the label sync reads
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

import { parse, stringify } from 'yaml';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const LABELS_FILE = '.github/labels.yml';
const CODERABBIT_FILE = '.coderabbit.yaml';
/** The fields `EndBug/label-sync` reads. */
const SYNCED_FIELDS = ['name', 'color', 'description', 'aliases'] as const;
const ALLOWED_FIELDS = new Set<string>([...SYNCED_FIELDS, 'ai_apply_when']);
/** CodeRabbit rejects longer labeling instructions. */
const MAX_INSTRUCTION_LENGTH = 3000;
const SECTION_START = '    labeling_instructions:\n';
const SECTION_INDENT = ' '.repeat(8);
/** A line indented no deeper than a `reviews` key, which ends the generated block. */
const SECTION_END = /^ {0,4}\S/m;

/** One label in `.github/labels.yml`. */
export interface Label {
    name: string;
    color: string;
    description?: string;
    aliases?: string[];
    /** CodeRabbit's instructions for when to apply the label; label sync never sees it. */
    ai_apply_when?: string;
}

/** The label catalog, or the problems that kept it from being read. */
export interface LabelCatalog {
    labels: Label[];
    errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Checks one catalog entry and returns it as a label, or `undefined` after recording its errors. */
function readLabel(entry: Record<string, unknown>, errors: string[]): Label | undefined {
    const { name, color, description, aliases, ai_apply_when: instructions } = entry;
    if (typeof name !== 'string' || name === '' || typeof color !== 'string' || color === '') {
        errors.push(`Every label in ${LABELS_FILE} needs a non-empty string name and color.`);
        return undefined;
    }
    const unknown = Object.keys(entry).filter((field) => !ALLOWED_FIELDS.has(field));
    if (unknown.length > 0) errors.push(`${name} has unsupported fields: ${unknown.join(', ')}.`);
    if (description !== undefined && typeof description !== 'string') {
        errors.push(`The description of ${name} must be a string.`);
    }
    if (aliases !== undefined && (!isStringArray(aliases) || aliases.includes(''))) {
        errors.push(`The aliases of ${name} must be non-empty strings.`);
    }
    if (instructions !== undefined) {
        if (typeof instructions !== 'string' || instructions.trim() === '') {
            errors.push(`ai_apply_when for ${name} must be a non-empty string.`);
        } else if (instructions.length > MAX_INSTRUCTION_LENGTH) {
            errors.push(`ai_apply_when for ${name} exceeds ${MAX_INSTRUCTION_LENGTH} characters.`);
        }
    }
    return {
        name,
        color,
        ...(typeof description === 'string' && { description }),
        ...(isStringArray(aliases) && { aliases }),
        ...(typeof instructions === 'string' && { ai_apply_when: instructions })
    };
}

/** Reads and checks the label catalog: field names and types, unique names and instructions. */
export async function readLabelCatalog(root: string = REPOSITORY_ROOT): Promise<LabelCatalog> {
    // Parsed YAML has no static type; every entry is narrowed below.
    const entries: unknown = parse(await readFile(join(root, LABELS_FILE), 'utf8'));
    if (!Array.isArray(entries) || !entries.every(isRecord)) {
        return { labels: [], errors: [`${LABELS_FILE} must be a YAML array of label mappings.`] };
    }

    const errors: string[] = [];
    const labels: Label[] = [];
    const names = new Set<string>();
    for (const entry of entries) {
        const label = readLabel(entry, errors);
        if (!label) continue;
        if (names.has(label.name)) errors.push(`${label.name} is defined more than once.`);
        names.add(label.name);
        labels.push(label);
    }
    return { labels, errors };
}

/** The label names `.coderabbit.yaml` sets outside the generated block. */
function referencedLabels(config: unknown): string[] {
    if (!isRecord(config) || !isRecord(config.reviews)) return [];
    const { mutually_exclusive_groups: groups, slop_detection: slop } = config.reviews;
    const names = isRecord(groups) ? Object.values(groups).filter(isStringArray).flat() : [];
    if (isRecord(slop) && typeof slop.label === 'string') names.push(slop.label);
    return names;
}

function renderCodeRabbitConfig(contents: string, labels: Label[]): string {
    const instructions = labels.flatMap(({ name, ai_apply_when }) =>
        ai_apply_when === undefined ? [] : [{ label: name, instructions: ai_apply_when }]
    );
    if (instructions.length === 0) throw new Error('At least one label must define ai_apply_when.');

    const start = contents.indexOf(SECTION_START);
    if (start < 0 || contents.indexOf(SECTION_START, start + 1) >= 0) {
        throw new Error(`${CODERABBIT_FILE} must contain reviews.labeling_instructions once.`);
    }
    const bodyStart = start + SECTION_START.length;
    const bodyLength = contents.slice(bodyStart).search(SECTION_END);
    const end = bodyLength < 0 ? contents.length : bodyStart + bodyLength;

    const rendered = stringify(instructions, { lineWidth: 120 - SECTION_INDENT.length })
        .trimEnd()
        .split('\n')
        .map((line) => `${SECTION_INDENT}${line}`)
        .join('\n');
    const updated = `${contents.slice(0, bodyStart)}${rendered}\n${contents.slice(end)}`;

    // Parsed YAML has no static type; only `reviews.labeling_instructions` is replaced.
    const expected: unknown = parse(contents);
    if (!isRecord(expected) || !isRecord(expected.reviews)) {
        throw new Error(`${CODERABBIT_FILE} must have a reviews mapping.`);
    }
    expected.reviews.labeling_instructions = instructions;
    if (!isDeepStrictEqual(expected, parse(updated))) {
        throw new Error(`Generating ${CODERABBIT_FILE} changed more than reviews.labeling_instructions.`);
    }
    return updated;
}

/**
 * Regenerates `reviews.labeling_instructions` in `.coderabbit.yaml` from the label catalog, and
 * checks that every label the file names elsewhere is in the catalog. With `check`, reports an
 * out-of-date file as an error instead of writing it.
 */
export async function syncCodeRabbitLabels({
    root = REPOSITORY_ROOT,
    check = false
}: { root?: string; check?: boolean } = {}): Promise<{ errors: string[]; changed: boolean }> {
    const { labels, errors } = await readLabelCatalog(root);
    if (errors.length > 0) return { errors, changed: false };

    const file = join(root, CODERABBIT_FILE);
    const contents = await readFile(file, 'utf8');
    const names = new Set(labels.map(({ name }) => name));
    const missing = referencedLabels(parse(contents)).filter((name) => !names.has(name));
    if (missing.length > 0) {
        const list = missing.map((name) => `"${name}"`).join(', ');
        return { errors: [`${CODERABBIT_FILE} names labels missing from ${LABELS_FILE}: ${list}.`], changed: false };
    }

    const updated = renderCodeRabbitConfig(contents, labels);
    const changed = updated !== contents;
    if (changed && check) {
        return { errors: [`${CODERABBIT_FILE} is out of date; run \`pnpm run labels:coderabbit\`.`], changed };
    }
    if (changed) await writeFile(file, updated);
    return { errors: [], changed };
}

/**
 * Writes the label catalog without CodeRabbit's field, in the format `EndBug/label-sync` reads.
 * Returns the catalog errors; nothing is written when there are any.
 */
export async function writeLabelManifest({
    root = REPOSITORY_ROOT,
    file
}: {
    root?: string;
    file: string;
}): Promise<string[]> {
    const { labels, errors } = await readLabelCatalog(root);
    if (errors.length > 0) return errors;
    const manifest = labels.map((label) =>
        Object.fromEntries(SYNCED_FIELDS.filter((field) => field in label).map((field) => [field, label[field]]))
    );
    await writeFile(file, stringify(manifest));
    return [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const { values } = parseArgs({ options: { check: { type: 'boolean' }, manifest: { type: 'string' } } });
    const errors = values.manifest
        ? await writeLabelManifest({ file: values.manifest })
        : (await syncCodeRabbitLabels({ check: values.check })).errors;
    for (const error of errors) console.error(`- ${error}`);
    if (errors.length > 0) process.exitCode = 1;
}
