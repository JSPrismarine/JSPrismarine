import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findJdkHome } from '../java/jdk.ts';
import { readJarVersion, resolveJavaRelease } from '../java/release.ts';
import { extractServer } from './extract.ts';

/**
 * Compiles and runs the Java property, attribute, and navigation dumper against the pinned Java
 * Edition server jar, then writes the goldens under `src/jsp/java/<release>/`.
 *
 * This is a capture-time task, run on a Java version bump rather than on every build. The jar
 * and everything extracted from it are untrusted data and stay under the cache directory; the
 * only things run against them are `javac` and the dumper itself.
 */

// The Java Edition release comes from the shared source manifest, so a version bump edits
// sources.json once and this script follows.
const release = await resolveJavaRelease(process.argv);
const JAVA_VERSION = release.version;
const SERVER_JAR_SHA1 = release.hash.value;
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cacheDir = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java', JAVA_VERSION);
const goldenDir = path.join(packageRoot, 'src/jsp/java', JAVA_VERSION);

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

/** The value a constructor argument of a primitive type takes in a call that never runs. */
const PRIMITIVE_ZERO = {
    boolean: 'false',
    byte: '(byte) 0',
    short: '(short) 0',
    char: "'\\0'",
    int: '0',
    long: '0L',
    float: '0F',
    double: '0D'
};

/** Splits a `javap` parameter list on its top-level commas, leaving those inside generics alone. */
const splitParameters = (list) => {
    const parameters = [];
    let depth = 0;
    let current = '';
    for (const character of list) {
        if (character === '<') depth++;
        if (character === '>') depth--;
        if (character === ',' && depth === 0) {
            parameters.push(current.trim());
            current = '';
        } else {
            current += character;
        }
    }
    if (current.trim() !== '') parameters.push(current.trim());
    return parameters;
};

/**
 * A `javap` parameter type with its generic arguments removed, so `Map<K, List<V>>` becomes `Map`.
 *
 * It tracks bracket depth rather than matching `<.*>`: a greedy match would turn
 * `Outer<A>.Inner<B>` into `Outer`, where erasure gives `Outer.Inner`.
 */
const eraseGenerics = (type) => {
    let depth = 0;
    let erased = '';
    for (const character of type) {
        if (character === '<') depth++;
        else if (character === '>') depth = Math.max(0, depth - 1);
        else if (depth === 0) erased += character;
    }
    return erased;
};

/**
 * The argument list for a probe's `super(...)` call, built from the constructor `javap` finds in
 * this release's jar.
 *
 * The dumper's probe server and level subclass Mojang's `MinecraftServer` and `ServerLevel` and are
 * allocated without running a constructor, so their `super` calls never execute. They still have
 * to compile, and the two constructors change shape between releases (26.4 added a `long` to the
 * server's and dropped two parameters from the level's). Reading the signature from the jar keeps
 * one dumper source compiling against every pinned release: each argument is a typed `null` or a
 * primitive zero, cast so the call names exactly one overload.
 */
const superArguments = (jdkHome, serverJar, className) => {
    const simpleName = className.slice(className.lastIndexOf('.') + 1);
    const listing = execFileSync(path.join(jdkHome, 'bin/javap'), ['-protected', '-cp', serverJar, className], {
        encoding: 'utf8'
    });
    const constructor = listing
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.includes(` ${className}(`));
    if (constructor === undefined) throw new Error(`javap found no constructor for ${className}`);
    const list = constructor.slice(constructor.indexOf('(') + 1, constructor.lastIndexOf(')'));
    return splitParameters(list)
        .map((parameter) => {
            const erased = eraseGenerics(parameter).replaceAll('$', '.');
            return PRIMITIVE_ZERO[erased] ?? `(${erased}) null`;
        })
        .join(', ');
};

/** The placeholder in `DumpJavaData.java` each probe's `super(...)` arguments replace. */
const SUPER_PLACEHOLDERS = {
    JSP_SUPER_ARGUMENTS_MINECRAFT_SERVER: 'net.minecraft.server.MinecraftServer',
    JSP_SUPER_ARGUMENTS_SERVER_LEVEL: 'net.minecraft.server.level.ServerLevel'
};

const runDumper = (jdkHome, serverJar, librariesDir) => {
    const classesDir = path.join(cacheDir, 'dump-classes');
    const sourceDir = path.join(cacheDir, 'dump-source');
    const outputDir = path.join(cacheDir, 'dump-out');
    const classpath = [serverJar, path.join(librariesDir, '*')].join(path.delimiter);

    let source = fs.readFileSync(path.join(here, 'DumpJavaData.java'), 'utf8');
    for (const [placeholder, className] of Object.entries(SUPER_PLACEHOLDERS)) {
        source = source.replace(placeholder, superArguments(jdkHome, serverJar, className));
    }
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'DumpJavaData.java'), source);

    console.log('Compiling the dumper...');
    execFileSync(
        path.join(jdkHome, 'bin/javac'),
        ['-nowarn', '-cp', classpath, '-d', classesDir, path.join(sourceDir, 'DumpJavaData.java')],
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
const { serverJar, librariesDir } = extractServer(jarPath, cacheDir, JAVA_VERSION);
// The dumper compiles against the jar's classes, so it needs the JDK the jar declares it was built for.
const { java_version: requiredJdkMajor } = await readJarVersion(jarPath);
const jdkHome = findJdkHome({ minimumMajor: requiredJdkMajor, binaries: ['java', 'javac', 'javap'] });
const outputDir = runDumper(jdkHome, serverJar, librariesDir);
writeGolden(outputDir, 'block_properties.json');
writeGolden(outputDir, 'entity_attributes.json');
writeGolden(outputDir, 'entity_navigation.json');
