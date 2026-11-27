import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findJdkHome } from '../../../bedrock-data/utils/java/jdk.ts';
import { readJarVersion, resolveJavaRelease } from '../../../bedrock-data/utils/java/release.ts';

/**
 * Compiles and runs each vector dumper in {@link DUMPERS} against a pinned Java Edition server jar,
 * then writes its `vectors/<release>/<file>`. This is a capture-time task, run on a Java version
 * bump rather than on every build; the committed vectors are what the test suite reads.
 *
 * The package's `vectors` script fetches the jar first. The jar and everything unpacked from it
 * are untrusted data and stay under the cache directory; the only things run against them are
 * `javac` and the dumper, both with an explicit classpath.
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
            `${required} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run ensure:java-server --java ${javaVersion}\` first; ` +
                'it downloads, verifies and unpacks the pinned server jar.'
        );
    }
}

// The dumper compiles against the server classes, so it needs the JDK the jar declares it was built for.
const { java_version: requiredJdkMajor } = await readJarVersion(bundlerJar);
const jdkHome = findJdkHome({ minimumMajor: requiredJdkMajor, binaries: ['java', 'javac'] });
const classpath = [serverJar, path.join(librariesDir, '*')].join(path.delimiter);
/**
 * Each dumper: its Java class, beside this script, the vectors file it writes, and whether it takes
 * that file's path or the directory to write it in.
 */
const DUMPERS = [
    { name: 'fluid spread', className: 'DumpFluidSpreadVectors', file: 'fluid-spread.json', takes: 'file' },
    { name: 'portal creation', className: 'DumpPortalVectors', file: 'portal-creation.json', takes: 'directory' }
];

const classesDir = path.join(cacheDir, 'block-behaviors-vector-classes');
const outputDir = path.join(cacheDir, 'block-behaviors-vector-out');

console.log('Compiling the vector dumpers...');
execFileSync(
    path.join(jdkHome, 'bin/javac'),
    [
        '-nowarn',
        '-cp',
        classpath,
        '-d',
        classesDir,
        ...DUMPERS.map(({ className }) => path.join(here, `${className}.java`))
    ],
    { stdio: 'inherit' }
);

const vectorsDir = path.join(packageRoot, 'vectors', javaVersion);
fs.mkdirSync(vectorsDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
const written = [];
for (const { name, className, file, takes } of DUMPERS) {
    console.log(`Running the ${name} dumper...`);
    const output = path.join(outputDir, file);
    // Mojang's logger writes a `logs/` directory into the working directory, so the dumper runs
    // inside the cache rather than in the repository root.
    execFileSync(
        path.join(jdkHome, 'bin/java'),
        ['-cp', [classesDir, classpath].join(path.delimiter), className, takes === 'directory' ? outputDir : output],
        { cwd: cacheDir, stdio: 'inherit' }
    );
    const target = path.join(vectorsDir, file);
    fs.writeFileSync(target, `${JSON.stringify(JSON.parse(fs.readFileSync(output, 'utf8')), null, 4)}\n`);
    written.push(target);
    console.log(`Wrote ${path.relative(packageRoot, target)}`);
}

// The vectors are checked in, so they have to pass `prettier --check` like everything else.
execFileSync(path.join(repoRoot, 'node_modules/.bin/prettier'), ['--write', '--log-level', 'warn', ...written], {
    stdio: 'inherit'
});
