import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findJdkHome } from '../../../bedrock-data/utils/java/jdk.ts';
import { readJarVersion, resolveJavaRelease } from '../../../bedrock-data/utils/java/release.ts';

/**
 * Compiles and runs the ender dragon vector dumper against a pinned Java Edition server jar, then
 * writes `vectors/<release>/dragon-*.json`. This is a capture-time task, run on a Java version
 * bump rather than on every build; the committed vectors are what the test suite reads.
 *
 * Run `pnpm --filter @jsprismarine/bedrock-data run ensure:java-server` first. The jar and
 * everything unpacked from it are untrusted data and stay under the cache directory; the only
 * things run against them are `javac` and the dumper, both with an explicit classpath.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(packageRoot, '../..');

// `--java <release>` picks a pinned Java Edition release, `javaServer.defaultVersion` when absent.
const javaVersion = (await resolveJavaRelease(process.argv)).version;

const cacheDir = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java', javaVersion);
const serverJar = path.join(cacheDir, 'extracted/META-INF/versions', javaVersion, `server-${javaVersion}.jar`);
const librariesDir = path.join(cacheDir, 'libraries');
const bundlerJar = path.join(cacheDir, 'server.jar');

for (const required of [bundlerJar, serverJar, librariesDir]) {
    if (!fs.existsSync(required)) {
        throw new Error(
            `${required} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run dump:java --java ${javaVersion}\` first; ` +
                'it downloads, verifies and unpacks the pinned server jar.'
        );
    }
}

// The dumper compiles against the server classes, so it needs the JDK the jar declares it was built for.
const { java_version: requiredJdkMajor } = await readJarVersion(bundlerJar);
const jdkHome = findJdkHome({ minimumMajor: requiredJdkMajor, binaries: ['java', 'javac'] });
const classpath = [serverJar, path.join(librariesDir, '*')].join(path.delimiter);
const classesDir = path.join(cacheDir, 'dragon-vector-classes');
const outputDir = path.join(cacheDir, 'dragon-vector-out');

console.log('Compiling the vector dumper...');
execFileSync(
    path.join(jdkHome, 'bin/javac'),
    ['-nowarn', '-cp', classpath, '-d', classesDir, path.join(here, 'DumpDragonVectors.java')],
    { stdio: 'inherit' }
);

console.log('Running the vector dumper...');
fs.mkdirSync(outputDir, { recursive: true });
// Mojang's logger writes a `logs/` directory into the working directory, so the dumper runs
// inside the cache rather than in the repository root.
execFileSync(
    path.join(jdkHome, 'bin/java'),
    ['-cp', [classesDir, classpath].join(path.delimiter), 'DumpDragonVectors', outputDir],
    { cwd: cacheDir, stdio: 'inherit' }
);

const vectorsDir = path.join(packageRoot, 'vectors', javaVersion);
fs.mkdirSync(vectorsDir, { recursive: true });
const written = [];
for (const name of ['dragon-nodes.json', 'dragon-fights.json']) {
    const parsed = JSON.parse(fs.readFileSync(path.join(outputDir, name), 'utf8'));
    const target = path.join(vectorsDir, name);
    fs.writeFileSync(target, `${JSON.stringify(parsed, null, 4)}\n`);
    written.push(target);
    console.log(`Wrote ${path.relative(packageRoot, target)}`);
}

// The vectors are checked in, so they have to pass `prettier --check` like everything else.
execFileSync(path.join(repoRoot, 'node_modules/.bin/prettier'), ['--write', '--log-level', 'warn', ...written], {
    stdio: 'inherit'
});
