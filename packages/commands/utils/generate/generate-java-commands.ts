/**
 * Generates `src/tables/javaCommands.json` from the pinned Java Edition 26.3
 * Brigadier command report. The report is Mojang's `reports/commands.json`,
 * republished by `misode/mcmeta` at the `26.3-summary` commit.
 *
 * Run with `pnpm --filter @jsprismarine/commands run generate:java-commands`.
 * The downloaded bytes are checked before they are parsed or written.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = {
    url: 'https://raw.githubusercontent.com/misode/mcmeta/d96c75fec200c4580dd75e033a76341521165461/commands/data.json',
    sha256: '9e14a839e32dbcaae044aeb987f1d9c4a4a3c8f7f3a8a3a87dc055e61fa8a84a'
};

interface JavaCommandNode {
    type: 'root' | 'literal' | 'argument';
    children?: Record<string, JavaCommandNode>;
    executable?: boolean;
    parser?: string;
    properties?: Record<string, string | number | boolean>;
    redirect?: string[];
}

const response = await fetch(source.url);
if (!response.ok) throw new Error(`Could not fetch Java command data: ${response.status} ${response.statusText}`);

const bytes = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== source.sha256) {
    throw new Error(`Java command data checksum mismatch: expected ${source.sha256}, got ${sha256}`);
}

const table: JavaCommandNode = JSON.parse(bytes.toString('utf8'));
if (table.type !== 'root' || Object.keys(table.children ?? {}).length !== 94) {
    throw new Error('The pinned Java command report must contain a root and 94 commands.');
}

const tablePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/tables/javaCommands.json');
writeFileSync(tablePath, `${JSON.stringify(table, null, 2)}\n`);
process.stdout.write(`Wrote ${Object.keys(table.children ?? {}).length} Java commands to ${tablePath}\n`);
