/**
 * Writes `packages/java-packs/src/generated/vanillaTextures.json` and `vanillaTextures.ts`: which
 * Java textures each vanilla Bedrock texture is, matched by pixels between the pinned Java
 * client jar and the pinned `bedrock-samples` resource pack, the two primary sources. A converted
 * pack uses the table to retexture a vanilla block or item on Java when a Bedrock pack retextures
 * it.
 *
 * Run on a Java or Bedrock version bump: `pnpm --filter @jsprismarine/bedrock-data run
 * dump:java-textures [--java <release>]`. It downloads the client jar `sources.json` pins, about
 * 40 MB, and reads `bedrock-samples` from the cache `ensure:bedrock-pack` fills.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { decodePng, decodeTga } from '../../../java-packs/src/image.ts';
import { readZip } from '../../../packs/src/zip.ts';
import { bedrockSamplesCacheFolder } from '../../src/sources.ts';
import { fetchSource } from '../fetch/fetch.ts';
import { javaClientDescriptor, loadJavaServerData, parseJavaArgument } from '../fetch/manifest.ts';
import { cacheRoot, packageDir } from '../java/worldgen-cache.ts';
import type { MatchImage } from './match.ts';
import { matchTextures } from './match.ts';
import { textureTableModuleSource, textureTableSource } from './source.ts';

const client = javaClientDescriptor(
    await loadJavaServerData(join(packageDir, 'sources.json')),
    parseJavaArgument(process.argv)
);
const fetched = await fetchSource(client, { cacheRoot });
const jarPath = fetched.fromOverride ? fetched.contentPath : join(fetched.contentPath, client.fileName);

const TEXTURES = 'assets/minecraft/textures/';
const java = new Map<string, MatchImage>();
// The jar holds about 4000 textures among 40 MB of classes; one budget covers reading it whole.
for (const [name, bytes] of readZip(readFileSync(jarPath), { budget: { remaining: 4 * 1024 ** 3 } })) {
    if (!name.startsWith(TEXTURES) || !name.endsWith('.png')) continue;
    const image = decodePng(bytes);
    if (image.ok) java.set(name.slice(TEXTURES.length, -'.png'.length), image);
}

const samples = join(cacheRoot, 'bedrock-samples', bedrockSamplesCacheFolder, 'unpacked');
const checkout = existsSync(samples)
    ? readdirSync(samples).find((name) => existsSync(join(samples, name, 'resource_pack')))
    : undefined;
if (checkout === undefined) {
    throw new Error(
        `${samples} holds no resource pack; run pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack first`
    );
}
const resourcePack = join(samples, checkout, 'resource_pack');
const bedrock = new Map<string, MatchImage>();
for (const entry of readdirSync(join(resourcePack, 'textures'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:png|tga)$/i.test(entry.name)) continue;
    const file = join(entry.parentPath, entry.name);
    const path = relative(resourcePack, file)
        .split(sep)
        .join('/')
        .replace(/\.[^.]+$/, '');
    // A path with both a PNG and a TGA draws the PNG, as the converter reads it.
    if (bedrock.has(path) && /\.tga$/i.test(entry.name)) continue;
    const bytes = new Uint8Array(readFileSync(file));
    const image = /\.png$/i.test(entry.name) ? decodePng(bytes) : decodeTga(bytes);
    if (image.ok) bedrock.set(path, image);
}

const matches = matchTextures(java, bedrock);
const outDir = resolve(packageDir, '../java-packs/src/generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'vanillaTextures.json'), textureTableSource(matches));
writeFileSync(join(outDir, 'vanillaTextures.ts'), textureTableModuleSource(client.version, bedrockSamplesCacheFolder));
spawnSync(
    'pnpm',
    ['exec', 'prettier', '--write', join(outDir, 'vanillaTextures.json'), join(outDir, 'vanillaTextures.ts')],
    { stdio: 'inherit' }
);
console.log(
    `Matched ${matches.matched.size} of ${matches.matched.size + matches.unmatched.length} Bedrock color textures to Java ${client.version}: ` +
        `${matches.byName} by their name and size, ${matches.byPixels} by their pixels; ${matches.unmatched.length} have no Java texture.`
);
