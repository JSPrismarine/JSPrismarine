/**
 * Writes `packages/protocol/src/java/versions/<release>/release.ts` and `packets.ts`: the Java
 * Edition release's protocol number and its packet ids by phase and direction.
 *
 * The protocol number is the server jar's `version.json`, and the ids are the data generator's
 * `reports/packets.json`, which `ensure:worldgen` leaves in the cache. This is a capture-time
 * task, run on a Java version bump: `pnpm --filter @jsprismarine/bedrock-data run
 * dump:java-protocol [--java <release>]`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { isRecord } from '../isRecord.ts';
import { readJarVersion, resolveJavaRelease } from '../java/release.ts';
import { javaServerJarPath, packageDir, worldgenCachePaths } from '../java/worldgen-cache.ts';
import { packetTableSource, releaseSource } from './source.ts';
import type { PacketTable } from './source.ts';

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
writeFileSync(join(outDir, 'release.ts'), releaseSource(release.version, jar.protocol_version));
writeFileSync(join(outDir, 'packets.ts'), packetTableSource(release.version, table));
console.log(`Wrote ${release.version}'s release and packet ids (protocol ${jar.protocol_version}) to ${outDir}`);
