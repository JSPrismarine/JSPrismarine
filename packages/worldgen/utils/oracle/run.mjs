import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compiles and runs the golden vector dumper against the pinned Java Edition server jar, then
 * writes `vectors/*.json`. This is a capture-time task, run on a Java version bump rather
 * than on every build; the committed vectors are what the test suite reads.
 *
 * Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` first. The jar and everything
 * unpacked from it are untrusted data and stay under the cache directory; the only things run
 * against them are `javac` and the dumper, both with an explicit classpath.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(packageRoot, '../..');

const sources = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/bedrock-data/sources.json'), 'utf8'));
const javaVersion = sources.javaServer.version;
// The 26.3 manifest declares Java 25, and the dumper compiles against the server classes.
const requiredJdkMajor = 25;

const cacheDir = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java', javaVersion);
const serverJar = path.join(cacheDir, 'extracted/META-INF/versions', javaVersion, `server-${javaVersion}.jar`);
const librariesDir = path.join(cacheDir, 'libraries');

for (const required of [serverJar, librariesDir]) {
    if (!fs.existsSync(required)) {
        throw new Error(
            `${required} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run dump:java\` first; ` +
                'it downloads, verifies and unpacks the pinned server jar.'
        );
    }
}

/** Finds a JDK of at least the required major version, or explains how to point at one. */
const findJdk = () => {
    const candidates = [];
    if (process.env.JSP_JAVA_HOME) candidates.push(process.env.JSP_JAVA_HOME);
    if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
    if (process.platform === 'darwin') {
        try {
            const home = execFileSync('/usr/libexec/java_home', ['-v', `${requiredJdkMajor}+`], {
                encoding: 'utf8'
            }).trim();
            if (home) candidates.push(home);
        } catch {
            // No matching JVM registered; the error below explains what to install.
        }
    }

    for (const home of candidates) {
        const javac = path.join(home, 'bin/javac');
        if (!fs.existsSync(javac)) continue;
        const major = Number(
            execFileSync(javac, ['-version'], { encoding: 'utf8' }).replace('javac ', '').split('.')[0]
        );
        if (major >= requiredJdkMajor) return home;
    }
    throw new Error(
        `No JDK ${requiredJdkMajor} or newer found. Install one (for example Temurin) or set JSP_JAVA_HOME.`
    );
};

const jdkHome = findJdk();
const classpath = [serverJar, path.join(librariesDir, '*')].join(path.delimiter);
const classesDir = path.join(cacheDir, 'worldgen-vector-classes');
const outputDir = path.join(cacheDir, 'worldgen-vector-out');

console.log('Compiling the vector dumper...');
execFileSync(
    path.join(jdkHome, 'bin/javac'),
    ['-nowarn', '-cp', classpath, '-d', classesDir, path.join(here, 'DumpWorldgenVectors.java')],
    { stdio: 'inherit' }
);

console.log('Running the vector dumper...');
execFileSync(
    path.join(jdkHome, 'bin/java'),
    ['-cp', [classesDir, classpath].join(path.delimiter), 'DumpWorldgenVectors', outputDir],
    { stdio: 'inherit' }
);

const vectorsDir = path.join(packageRoot, 'vectors');
fs.mkdirSync(vectorsDir, { recursive: true });
for (const name of ['random.json', 'noise.json', 'density.json', 'chunk.json']) {
    const parsed = JSON.parse(fs.readFileSync(path.join(outputDir, name), 'utf8'));
    const target = path.join(vectorsDir, name);
    fs.writeFileSync(target, `${JSON.stringify(parsed, null, 4)}\n`);
    console.log(`Wrote ${path.relative(packageRoot, target)}`);
}
