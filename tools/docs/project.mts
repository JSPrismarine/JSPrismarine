/**
 * Facts about the project, read from the repository: the site's landing page and the docs facts both
 * use them, so a value is written once, in the code it describes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import typedoc from './typedoc.json' with { type: 'json' };

/**
 * The license identifiers in an SPDX expression, such as `MIT` and `MPL-2.0` for
 * `(MIT OR MPL-2.0)`, without its operators and parentheses.
 */
export const spdxLicenseIds = (expression: string) =>
    expression
        .replace(/[()]/g, ' ')
        .split(/\s+/)
        .filter((token) => token !== '' && !['OR', 'AND', 'WITH'].includes(token));

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packagesDir = path.join(repoRoot, 'packages');

interface Manifest {
    description?: string;
    engines?: Record<string, string>;
    license?: string;
    name: string;
    private?: boolean;
    repository?: { url: string };
    scripts?: Record<string, string>;
    version: string;
}

/** One published package, as it appears on npm. */
export interface PublishedPackage {
    description: string;
    /** The package's folder under `packages/`. */
    directory: string;
    name: string;
    version: string;
    /**
     * Where the package is documented: its API reference on the site, `/api/<name>/`, or its README on
     * GitHub when `typedoc.json` excludes it, so the API reference has no page for it.
     */
    reference: string;
}

/** A protocol version the server speaks and the Minecraft releases that use it. */
export interface SupportedProtocol {
    minecraft: string[];
    protocol: number;
    /** Whether the protocol is a Minecraft preview, which the server accepts but never advertises. */
    preview: boolean;
}

/** One prebuilt server executable the release workflow publishes. */
export interface Executable {
    /** The release asset's file name, such as `prismarine-linux-x64`. */
    file: string;
    os: 'linux' | 'darwin' | 'windows';
}

/** The public demo server, and the host that provides part of it. */
export interface DemoServer {
    address: string;
    /** The name the "Add to Minecraft" link gives the server in a player's list. */
    name: string;
    port: number;
    sponsor: { discount: string; name: string; url: string };
}

/**
 * The demo server anyone can join. No code records where it runs, so this is the one place its
 * address is written; the landing page and the docs facts read it from here.
 */
export const demoServer: DemoServer = {
    address: 'demo.jsprismarine.dev',
    name: 'JSPrismarine demo',
    port: 19132,
    sponsor: { discount: '15%', name: 'RespawnHost', url: 'https://rspwn.click/jsprismarine' }
};

/** Facts about the project that the landing page shows. They are read from the repository, never typed in. */
export interface ProjectData {
    /** The port a fresh server listens on. */
    defaultPort: number;
    /** The TCP port a server with Java Edition on listens on for Java clients. */
    javaPort: number;
    demo: DemoServer;
    engines: { node: string; pnpm: string };
    /** The SPDX license expression the workspace is released under, such as `(MIT OR MPL-2.0)`. */
    license: string;
    /** The licenses in that expression, such as `MIT` and `MPL-2.0`; the project may be used under any one. */
    licenses: string[];
    /** The executables each release ships, from the Bun targets the release build compiles. */
    executables: Executable[];
    /** The GitHub releases that carry those executables. */
    releasesUrl: string;
    /** Whether a fresh server requires players to sign in to Xbox Live. */
    onlineMode: boolean;
    /** The UDP port NetherNet LAN discovery uses. */
    netherNetLanPort: number;
    /** The file in the data directory that keeps the server's NetherNet identity key. */
    netherNetIdentityFile: string;
    packages: PublishedPackage[];
    /** Released protocols, newest first, matching the order of the server's startup banner. */
    protocols: SupportedProtocol[];
    /** The Minecraft preview protocol the server also accepts, when it has one. */
    preview: SupportedProtocol | undefined;
    repositoryUrl: string;
    version: string;
}

/** The npm scope the packages are published under, such as `@jsprismarine`, read from the first one. */
export function packageScope(packages: readonly PublishedPackage[]) {
    return packages[0]?.name.split('/')[0] ?? '';
}

/** Reads a JSON manifest; the file is parsed at a boundary the compiler cannot see. */
function readManifest(file: string): Manifest {
    return JSON.parse(readFileSync(file, 'utf8'));
}

/** Pulls a value out of source text with a pattern and fails the docs build when the source changed shape. */
function fromSource(file: string, pattern: RegExp, what: string) {
    const match = pattern.exec(readFileSync(file, 'utf8'));
    if (!match) throw new Error(`The docs landing page reads ${what} from ${file}, but its pattern no longer matches.`);
    return match;
}

/** Reads the project facts from the repository. */
export function loadProject(): ProjectData {
    const root = readManifest(path.join(repoRoot, 'package.json'));
    // The landing page shows these commands, so a rename must break the build rather than the page.
    for (const script of ['dev']) {
        if (!root.scripts?.[script])
            throw new Error(`The docs landing page shows "pnpm run ${script}", which is gone.`);
    }

    const repositoryUrl = (root.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
    // TypeDoc documents every package folder except the ones its config excludes by path.
    const undocumented = new Set(
        typedoc.exclude.flatMap((entry) => /^\.\.\/\.\.\/packages\/([^/*]+)$/.exec(entry)?.[1] ?? [])
    );
    const packages = readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
            try {
                return [
                    {
                        directory: entry.name,
                        manifest: readManifest(path.join(packagesDir, entry.name, 'package.json'))
                    }
                ];
            } catch {
                return [];
            }
        })
        .filter(({ manifest }) => !manifest.private)
        .map(({ directory, manifest: { name, description = '', version } }) => ({
            name,
            description,
            directory,
            version,
            reference: undocumented.has(directory)
                ? `${repositoryUrl}/tree/master/packages/${directory}#readme`
                : `/api/${name}/`
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const versionsDir = path.join(packagesDir, 'protocol', 'src', 'bedrock', 'wire', 'versions');
    const protocols = readdirSync(versionsDir)
        .flatMap((file) => {
            const match = /^v(\d+)\.ts$/.exec(file);
            return match ? [{ file, protocol: match[1] }] : [];
        })
        .map(({ file, protocol }) => {
            const [, list] = fromSource(
                path.join(versionsDir, file),
                /minecraftVersions: readonly string\[\] = \[([^\]]*)\]/,
                'the Minecraft versions of a protocol'
            );
            const source = readFileSync(path.join(versionsDir, file), 'utf8');
            return {
                protocol: Number(protocol),
                minecraft: [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]),
                preview: /^export const preview = true;$/m.test(source)
            };
        })
        .sort((a, b) => b.protocol - a.protocol);
    const preview = protocols.find((protocol) => protocol.preview);

    const [, port] = fromSource(
        path.join(packagesDir, 'prismarine', 'src', 'config', 'Config.ts'),
        /^\s+'server-port': (\d+),$/m,
        'the default port'
    );

    const [, javaPort] = fromSource(
        path.join(packagesDir, 'prismarine', 'src', 'config', 'Config.ts'),
        /^\s+'java-port': (\d+),$/m,
        'the default Java Edition port'
    );

    const netherNetDefaults = path.join(
        packagesDir,
        'prismarine',
        'src',
        'network',
        'nethernet',
        'NetherNetDefaults.ts'
    );
    const [, netherNetLanPort] = fromSource(
        path.join(packagesDir, 'nethernet', 'src', 'NetherNetDefaults.ts'),
        /^export const NETHERNET_LAN_PORT = (\d+);$/m,
        'the NetherNet LAN port'
    );
    const [, netherNetIdentityFile] = fromSource(
        netherNetDefaults,
        /^export const NETHERNET_IDENTITY_FILE = '([^']+)';$/m,
        'the NetherNet identity file'
    );

    const [, onlineMode] = fromSource(
        path.join(packagesDir, 'prismarine', 'src', 'config', 'Config.ts'),
        /^\s+'online-mode': (true|false),$/m,
        'the default online mode'
    );

    // The release workflow names each asset after its Bun target, and Bun adds `.exe` on Windows.
    const [, targetList] = fromSource(
        path.join(repoRoot, '.github', 'scripts', 'build-aot.mjs'),
        /const supportedTargets = new Set\(\[([^\]]+)\]\)/,
        'the executable targets'
    );
    const executables = [...targetList.matchAll(/'bun-((\w+)-[\w-]+)'/g)].flatMap(([, name, os]): Executable[] =>
        os === 'linux' || os === 'darwin' || os === 'windows'
            ? [{ file: `prismarine-${name}${os === 'windows' ? '.exe' : ''}`, os }]
            : []
    );
    return {
        executables,
        releasesUrl: `${repositoryUrl}/releases?q=jsprismarine%40&expanded=true`,
        onlineMode: onlineMode === 'true',
        netherNetLanPort: Number(netherNetLanPort),
        netherNetIdentityFile,
        defaultPort: Number(port),
        javaPort: Number(javaPort),
        demo: demoServer,
        engines: { node: root.engines?.node ?? '', pnpm: root.engines?.pnpm ?? '' },
        license: root.license ?? '',
        licenses: spdxLicenseIds(root.license ?? ''),
        packages,
        protocols: protocols.filter((protocol) => !protocol.preview),
        preview,
        repositoryUrl,
        // The startup banner prints the prismarine package's version; the workspace root is unversioned.
        version: readManifest(path.join(packagesDir, 'prismarine', 'package.json')).version
    };
}
