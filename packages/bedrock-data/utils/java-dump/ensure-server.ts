/**
 * Ensures the pinned Java server jar is available for tests and worldgen vector generation.
 * Unlike `dump:java`, this only downloads and extracts the inner jar; it does not run Java or
 * rewrite any captured data.
 */
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashFile } from '../fetch/hash.ts';
import { fetchSource } from '../fetch/fetch.ts';
import { loadSourceDescriptors } from '../fetch/manifest.ts';
import { readZipEntry } from '../fetch/unzip.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageDir, '../..');
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');

const override = process.env['JSP_JAVA_SERVER_JAR'];
if (override) {
    const overrideStat = await stat(override).catch(() => undefined);
    if (!overrideStat?.isFile()) {
        throw new Error(`JSP_JAVA_SERVER_JAR points to a missing file: ${override}`);
    }
    console.log(`Using JSP_JAVA_SERVER_JAR=${override}`);
} else {
    const descriptors = await loadSourceDescriptors(join(packageDir, 'sources.json'));
    const javaServer = descriptors.find((descriptor) => descriptor.name === 'java-server');
    if (!javaServer) throw new Error('sources.json no longer pins a java-server source');

    let source = await fetchSource(javaServer, { cacheRoot });
    let outerJarPath = source.fromOverride ? source.contentPath : join(source.contentPath, javaServer.fileName);
    let outerJarStat = await stat(outerJarPath).catch(() => undefined);
    if (!outerJarStat?.isFile() && source.fromCache) {
        await rm(join(dirname(outerJarPath), '.jsp-fetch.json'), { force: true });
        source = await fetchSource(javaServer, { cacheRoot });
        outerJarPath = source.fromOverride ? source.contentPath : join(source.contentPath, javaServer.fileName);
        outerJarStat = await stat(outerJarPath).catch(() => undefined);
    }
    if (!outerJarStat?.isFile()) {
        throw new Error(`${outerJarPath} is not a Java server jar file`);
    }
    if (source.fromOverride) {
        const digest = await hashFile(outerJarPath, javaServer.hash.algorithm);
        if (digest !== javaServer.hash.value) {
            throw new Error(
                `${outerJarPath} has ${javaServer.hash.algorithm} ${digest}, but sources.json pins ` +
                    `${javaServer.hash.value}. Refusing to read it.`
            );
        }
    }

    const innerJarName = `META-INF/versions/${javaServer.version}/server-${javaServer.version}.jar`;
    const destination = join(cacheRoot, 'java', javaServer.version, 'extracted', ...innerJarName.split('/'));
    const innerJarStat = await stat(destination).catch(() => undefined);
    if (!innerJarStat?.isFile() || innerJarStat.size === 0) {
        await rm(destination, { force: true });
        const innerJar = await readZipEntry(outerJarPath, innerJarName);
        if (!innerJar) throw new Error(`${outerJarPath} holds no ${innerJarName}`);

        await mkdir(dirname(destination), { recursive: true });
        const partial = `${destination}.partial`;
        await rm(partial, { force: true });
        await writeFile(partial, innerJar);
        await rename(partial, destination);
    }

    console.log(`Java ${javaServer.version} server jar is ready at ${destination}`);
}
