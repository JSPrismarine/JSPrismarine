import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const packagesDir = path.join(repoRoot, 'packages');

interface Manifest {
    description?: string;
    engines?: Record<string, string>;
    name: string;
    private?: boolean;
    repository?: { url: string };
    scripts?: Record<string, string>;
    version: string;
}

/** One published package, as it appears on npm. */
export interface PublishedPackage {
    description: string;
    name: string;
    version: string;
}

/** A protocol version the server speaks and the Minecraft releases that use it. */
export interface SupportedProtocol {
    minecraft: string[];
    protocol: number;
}

/** Facts about the project that the landing page shows. They are read from the repository, never typed in. */
export interface ProjectData {
    /** The port a fresh server listens on. */
    defaultPort: number;
    engines: { node: string; pnpm: string };
    /** Whether a fresh server requires players to sign in to Xbox Live. */
    onlineMode: boolean;
    packages: PublishedPackage[];
    /** Newest protocol first, matching the order of the server's startup banner. */
    protocols: SupportedProtocol[];
    repositoryUrl: string;
    version: string;
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

function load(): ProjectData {
    const root = readManifest(path.join(repoRoot, 'package.json'));
    // The landing page shows these commands, so a rename must break the build rather than the page.
    for (const script of ['dev', 'start', 'package']) {
        if (!root.scripts?.[script])
            throw new Error(`The docs landing page shows "pnpm run ${script}", which is gone.`);
    }

    const packages = readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
            try {
                return [readManifest(path.join(packagesDir, entry.name, 'package.json'))];
            } catch {
                return [];
            }
        })
        .filter((manifest) => !manifest.private)
        .map(({ name, description = '', version }) => ({ name, description, version }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const versionsDir = path.join(packagesDir, 'protocol', 'src', 'wire', 'versions');
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
            return { protocol: Number(protocol), minecraft: [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]) };
        })
        .sort((a, b) => b.protocol - a.protocol);

    const [, port] = fromSource(
        path.join(packagesDir, 'prismarine', 'src', 'config', 'Config.ts'),
        /^\s+port: (\d+),$/m,
        'the default port'
    );

    const [, onlineMode] = fromSource(
        path.join(packagesDir, 'prismarine', 'src', 'config', 'Config.ts'),
        /^\s+'online-mode': (true|false),$/m,
        'the default online mode'
    );

    return {
        onlineMode: onlineMode === 'true',
        defaultPort: Number(port),
        engines: { node: root.engines?.node ?? '', pnpm: root.engines?.pnpm ?? '' },
        packages,
        protocols,
        repositoryUrl: (root.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, ''),
        // The startup banner prints the prismarine package's version; the workspace root is unversioned.
        version: readManifest(path.join(packagesDir, 'prismarine', 'package.json')).version
    };
}

declare const data: ProjectData;
export { data };

export default {
    watch: [
        '../../../package.json',
        '../../../packages/*/package.json',
        '../../../packages/protocol/src/wire/versions/*.ts',
        '../../../packages/prismarine/src/config/Config.ts'
    ],
    load
};
