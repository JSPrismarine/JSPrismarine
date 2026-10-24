import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Compiles and runs the Java property and attribute dumper against the pinned Java Edition
 * server jar, then writes the goldens under `src/jsp/java/`.
 *
 * This is a capture-time task, run on a Java version bump rather than on every build. The jar
 * and everything extracted from it are untrusted data and stay under the cache directory; the
 * only things run against them are `javac` and the dumper itself.
 */

// The Java Edition pin. A parallel slice adds a shared source manifest; until the merge moves
// them there, every pinned value lives in this block.
const JAVA_VERSION = '26.3';
const SERVER_JAR_SHA1 = '33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c';
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
// The jar needs class files the dumper compiles against; the 26.3 manifest declares Java 25.
const REQUIRED_JDK_MAJOR = 25;

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cacheDir = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java', JAVA_VERSION);
const goldenDir = path.join(packageRoot, 'src/jsp/java');

const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
    return response.json();
};

const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

/** Resolves the pinned version's server jar URL through the piston-meta manifest chain. */
const resolveServerJar = async () => {
    const manifest = await fetchJson(VERSION_MANIFEST_URL);
    const version = manifest.versions.find((entry) => entry.id === JAVA_VERSION);
    if (!version) throw new Error(`Version ${JAVA_VERSION} is not in the manifest at ${VERSION_MANIFEST_URL}`);

    const details = await fetchJson(version.url);
    const server = details.downloads.server;
    if (server.sha1 !== SERVER_JAR_SHA1) {
        throw new Error(
            `The manifest announces server jar sha1 ${server.sha1}, but this script pins ${SERVER_JAR_SHA1}. ` +
                'Mojang republished the version; re-verify the jar before updating the pin.'
        );
    }
    return server.url;
};

const downloadServerJar = async () => {
    const jarPath = path.join(cacheDir, 'server.jar');
    if (fs.existsSync(jarPath) && sha1(jarPath) === SERVER_JAR_SHA1) return jarPath;

    const url = await resolveServerJar();
    console.log(`Downloading ${url}`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
    fs.writeFileSync(jarPath, Buffer.from(await response.arrayBuffer()));

    const actual = sha1(jarPath);
    if (actual !== SERVER_JAR_SHA1) {
        fs.rmSync(jarPath);
        throw new Error(`Downloaded jar sha1 ${actual} does not match the pinned ${SERVER_JAR_SHA1}`);
    }
    return jarPath;
};

/**
 * Unpacks the server classes and bundled libraries from the bundler jar, the documented layout
 * since 1.18: the real server jar sits at `META-INF/versions/<version>/` and its 39 dependencies
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
    const candidates = [];
    if (process.env.JSP_JAVA_HOME) candidates.push(process.env.JSP_JAVA_HOME);
    if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
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

const runDumper = (jdkHome, serverJar, librariesDir) => {
    const classesDir = path.join(cacheDir, 'dump-classes');
    const outputDir = path.join(cacheDir, 'dump-out');
    const classpath = [serverJar, path.join(librariesDir, '*')].join(path.delimiter);

    console.log('Compiling the dumper...');
    execFileSync(
        path.join(jdkHome, 'bin/javac'),
        ['-nowarn', '-cp', classpath, '-d', classesDir, path.join(here, 'DumpJavaData.java')],
        { stdio: 'inherit' }
    );

    console.log('Running the dumper...');
    execFileSync(
        path.join(jdkHome, 'bin/java'),
        ['-cp', [classesDir, classpath].join(path.delimiter), 'DumpJavaData', outputDir],
        { stdio: 'inherit' }
    );
    return outputDir;
};

/** Rewrites one dump as sorted, indented JSON so a golden refresh diffs cleanly. */
const writeGolden = (outputDir, name) => {
    const raw = JSON.parse(fs.readFileSync(path.join(outputDir, name), 'utf8'));
    const sorted = Object.fromEntries(Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)));
    fs.mkdirSync(goldenDir, { recursive: true });
    const target = path.join(goldenDir, name);
    fs.writeFileSync(target, `${JSON.stringify(sorted, null, 4)}\n`);
    console.log(`Wrote ${path.relative(packageRoot, target)} (${Object.keys(sorted).length} entries)`);
};

const jarPath = await downloadServerJar();
const { serverJar, librariesDir } = extractServer(jarPath);
const outputDir = runDumper(findJdk(), serverJar, librariesDir);
writeGolden(outputDir, 'block_properties.json');
writeGolden(outputDir, 'entity_attributes.json');
