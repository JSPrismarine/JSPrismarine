import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compiles and runs the block transform dumper against the pinned Java Edition server jar and
 * leaves `block_transforms.json` in the cache directory for the table generator beside this file.
 *
 * This is a capture-time task, run on a Java version bump rather than on every build. The jar and
 * everything extracted from it are untrusted data and stay under the cache directory; the only
 * things run against them are `javac` and the dumper.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(packageRoot, '../..');

// The pin lives in the shared source manifest, so a version bump edits that file once.
const sources = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/bedrock-data/sources.json'), 'utf8'));
const JAVA_VERSION = sources.javaServer.version;
const SERVER_JAR_SHA1 = sources.javaServer.sha1;
// The 26.3 version manifest declares Java 25 for the server classes.
const REQUIRED_JDK_MAJOR = 25;

const cacheDir = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java', JAVA_VERSION);

const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

/** The hash-verified bundler jar, from either cache layout `fetch:sources` writes. */
export const findServerJar = () => {
    const candidates = [
        process.env.JSP_JAVA_JAR_PATH,
        path.join(cacheDir, 'server.jar'),
        path.join(repoRoot, 'node_modules/.cache/jsprismarine/java-server', JAVA_VERSION, 'server.jar')
    ].filter((candidate) => candidate !== undefined);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && sha1(candidate) === SERVER_JAR_SHA1) return candidate;
    }
    throw new Error(
        `No Java ${JAVA_VERSION} server jar with sha1 ${SERVER_JAR_SHA1} found. Run ` +
            '`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` or set JSP_JAVA_JAR_PATH.'
    );
};

/**
 * Unpacks the server classes and bundled libraries from the bundler jar, the documented layout
 * since 1.18: the real server jar sits at `META-INF/versions/<version>/` and its dependencies
 * under `META-INF/libraries/`.
 */
const extractServer = (jarPath) => {
    const extractedDir = path.join(cacheDir, 'extracted');
    const serverJar = path.join(extractedDir, 'META-INF/versions', JAVA_VERSION, `server-${JAVA_VERSION}.jar`);
    if (!fs.existsSync(serverJar)) {
        execFileSync('unzip', ['-o', '-q', jarPath, 'META-INF/versions/*', 'META-INF/libraries/*', '-d', extractedDir]);
    }

    const librariesDir = path.join(cacheDir, 'libraries');
    fs.mkdirSync(librariesDir, { recursive: true });
    const copyJars = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) copyJars(entryPath);
            else if (entry.name.endsWith('.jar')) fs.copyFileSync(entryPath, path.join(librariesDir, entry.name));
        }
    };
    copyJars(path.join(extractedDir, 'META-INF/libraries'));

    return { serverJar, librariesDir };
};

/** Finds a JDK of at least the required major version, or explains how to point at one. */
const findJdk = () => {
    const candidates = [process.env.JSP_JAVA_HOME, process.env.JAVA_HOME].filter(
        (candidate) => candidate !== undefined
    );
    if (process.platform === 'darwin') {
        try {
            const home = execFileSync('/usr/libexec/java_home', ['-v', `${REQUIRED_JDK_MAJOR}+`], {
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
        const version = execFileSync(javac, ['-version'], { encoding: 'utf8' }).trim();
        const major = Number(version.replace('javac ', '').split('.')[0]);
        if (major >= REQUIRED_JDK_MAJOR) return home;
    }
    throw new Error(
        `No JDK ${REQUIRED_JDK_MAJOR} or newer found. Install one (for example Temurin) or set ` +
            'JSP_JAVA_HOME to the home directory of a suitable JDK.'
    );
};

/** Compiles and runs the dumper, returning the path of the JSON it wrote. */
export const dumpBlockTransforms = () => {
    const { serverJar, librariesDir } = extractServer(findServerJar());
    const jdkHome = findJdk();
    const classesDir = path.join(cacheDir, 'transform-classes');
    const outputDir = path.join(cacheDir, 'transform-out');
    const classpath = [serverJar, path.join(librariesDir, '*')].join(path.delimiter);

    console.log('Compiling the block transform dumper...');
    execFileSync(
        path.join(jdkHome, 'bin/javac'),
        ['-nowarn', '-cp', classpath, '-d', classesDir, path.join(here, 'DumpBlockTransforms.java')],
        { stdio: 'inherit' }
    );

    console.log('Running the block transform dumper...');
    execFileSync(
        path.join(jdkHome, 'bin/java'),
        ['-cp', [classesDir, classpath].join(path.delimiter), 'DumpBlockTransforms', outputDir],
        { stdio: 'inherit' }
    );
    return path.join(outputDir, 'block_transforms.json');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) dumpBlockTransforms();
