/**
 * Writes `packages/protocol/src/java/versions/<release>/release.ts`, `packets.ts`,
 * `blockStates.json`, `registries.json` and `lang.json`: the Java Edition release's protocol
 * number, its packet ids by phase and direction, the rows every block state id follows from, the
 * static registries a play packet names entries of by number, and the English of the keys the
 * server sends or prints.
 *
 * The protocol number is the server jar's `version.json`, and the ids are the data generator's
 * `reports/packets.json`, which `ensure:worldgen` leaves in the cache, as it leaves the jar's
 * `en_us.json`. This is a capture-time
 * task, run on a Java version bump: `pnpm --filter @jsprismarine/bedrock-data run
 * dump:java-protocol [--java <release>]`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isRecord } from '../isRecord.ts';
import { readJarVersion, resolveJavaRelease } from '../java/release.ts';
import { extractJavaLang, javaLangPath } from '../java/extract-lang.ts';
import { javaServerJarPath, packageDir, worldgenCachePaths } from '../java/worldgen-cache.ts';
import {
    blockStateRows,
    blockStatesModuleSource,
    blockStatesSource,
    configurationModuleSource,
    javaReleasesSource,
    LANG_PREFIXES,
    langModuleSource,
    langSource,
    newestSource,
    packetTableSource,
    registriesModuleSource,
    releaseSource,
    STATIC_REGISTRIES,
    staticRegistriesSource
} from './source.ts';
import type { DumpedRelease, PacketTable, ReportBlock } from './source.ts';

const release = await resolveJavaRelease(process.argv);
const reportPath = join(worldgenCachePaths(release.version).reports, 'reports', 'packets.json');
if (!existsSync(reportPath)) {
    throw new Error(`${reportPath} is missing; run pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen first`);
}

// Extracted game data: parsed, never executed.
const report: unknown = JSON.parse(readFileSync(reportPath, 'utf8'));
if (!isRecord(report)) throw new Error(`${reportPath} is not an object of phases`);
const table: PacketTable = {};
for (const [phase, directions] of Object.entries(report)) {
    if (!isRecord(directions)) throw new Error(`${reportPath}: phase ${phase} is not an object of directions`);
    table[phase] = {};
    for (const [direction, packets] of Object.entries(directions)) {
        if (!isRecord(packets)) throw new Error(`${reportPath}: ${phase} ${direction} is not an object of packets`);
        const ids: Record<string, number> = {};
        for (const [name, entry] of Object.entries(packets)) {
            if (!isRecord(entry) || typeof entry.protocol_id !== 'number') {
                throw new Error(`${reportPath}: ${phase} ${direction} ${name} has no protocol_id`);
            }
            ids[name] = entry.protocol_id;
        }
        table[phase][direction] = ids;
    }
}

const jar = await readJarVersion(javaServerJarPath(release));
if (jar.id !== release.version) throw new Error(`the cached jar is ${jar.id}, not ${release.version}`);

const outDir = resolve(packageDir, '../protocol/src/java/versions', release.version);
mkdirSync(outDir, { recursive: true });
writeFileSync(
    join(outDir, 'release.ts'),
    releaseSource(release.version, jar.protocol_version, [
        jar.pack_version.resource_major,
        jar.pack_version.resource_minor
    ])
);
writeFileSync(join(outDir, 'packets.ts'), packetTableSource(release.version, table));

const blocksPath = join(worldgenCachePaths(release.version).reports, 'reports', 'blocks.json');
// Extracted game data: parsed, never executed. The rows check every state's id against it.
const blocks = JSON.parse(readFileSync(blocksPath, 'utf8')) as Record<string, ReportBlock>;
const rows = blockStateRows(blocks);
writeFileSync(join(outDir, 'blockStates.json'), blockStatesSource(rows));

// The static registries a play packet names entries of by number, which the client knows itself.
const registriesPath = join(worldgenCachePaths(release.version).reports, 'reports', 'registries.json');
// Extracted game data: parsed, never executed.
const registries: unknown = JSON.parse(readFileSync(registriesPath, 'utf8'));
writeFileSync(join(outDir, 'registries.json'), staticRegistriesSource(registries, STATIC_REGISTRIES));

// The English of the keys the server sends or prints, which the console and a client without the
// key show.
const langPath = javaLangPath(release.version);
if (!existsSync(langPath)) await extractJavaLang(javaServerJarPath(release), langPath);
// Extracted game data: parsed, never executed.
const lang: unknown = JSON.parse(readFileSync(langPath, 'utf8'));
writeFileSync(join(outDir, 'lang.json'), langSource(lang, LANG_PREFIXES));

writeFileSync(join(outDir, 'blockStates.ts'), blockStatesModuleSource(release.version));
writeFileSync(join(outDir, 'registries.ts'), registriesModuleSource(release.version));
writeFileSync(join(outDir, 'lang.ts'), langModuleSource(release.version));
writeFileSync(join(outDir, 'configuration.ts'), configurationModuleSource(release.version));
console.log(
    `Wrote ${release.version}'s release, packet ids and ${rows.length} blocks' states (protocol ${jar.protocol_version}) to ${outDir}`
);

// What the release's configuration phase sends, which only running its server shows. The capture
// logs in with the packet ids written above.
const captured = spawnSync(
    'pnpm',
    ['--filter', '@jsprismarine/protocol', 'run', 'capture:java-configuration', '--java', release.version],
    { stdio: 'inherit' }
);
if (captured.status !== 0) throw new Error(`capture:java-configuration --java ${release.version} failed`);

// Every release written so far, which the server speaks unless it is a snapshot.
const versionsDir = resolve(outDir, '..');
const dumped: DumpedRelease[] = [];
for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
    const releaseModule = join(versionsDir, entry.name, 'release.ts');
    if (!entry.isDirectory() || !existsSync(releaseModule)) continue;
    // A module this script wrote, loaded by path because the releases are found at run time.
    const { RELEASE } = await import(pathToFileURL(releaseModule).href);
    dumped.push({ version: RELEASE.minecraftVersion, protocolVersion: RELEASE.protocolVersion });
}
writeFileSync(join(versionsDir, 'javaReleases.ts'), javaReleasesSource(dumped));
writeFileSync(join(versionsDir, 'newest.ts'), newestSource(dumped));
spawnSync(
    'pnpm',
    [
        'exec',
        'prettier',
        '--write',
        join(versionsDir, 'javaReleases.ts'),
        join(versionsDir, 'newest.ts'),
        ...['release', 'packets', 'blockStates', 'registries', 'lang', 'configuration'].map((name) =>
            join(outDir, `${name}.ts`)
        )
    ],
    { stdio: 'inherit' }
);
console.log(`Registered ${dumped.map(({ version }) => version).join(', ')} in ${versionsDir}`);
