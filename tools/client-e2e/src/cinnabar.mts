/**
 * Resolves and builds the pinned cinnabar checkout that the e2e harness drives.
 *
 * `cinnabar.json` gives each wire protocol one cinnabar commit and the transports it runs over. A
 * build belongs to its commit, not to a protocol or transport: its checkout and its Cargo and Go
 * outputs live under `$XDG_CACHE_HOME/jsprismarine/cinnabar/<build>`, where `<build>` is the
 * commit's first 12 characters, so every entry that names a commit shares one build.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The JSPrismarine repository root this harness belongs to. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const pinFile = path.join(repoRoot, 'tools', 'client-e2e', 'cinnabar.json');

const cacheRoot = (): string =>
    process.env.JSP_CINNABAR_CACHE_DIR ||
    path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'jsprismarine', 'cinnabar');

/**
 * How the client reaches the scratch server. Cinnabar picks the transport the way the game does,
 * probing the address for NetherNet signaling and falling back to RakNet, so a NetherNet run is
 * one whose server has RakNet turned off.
 */
export const CLIENT_TRANSPORTS = ['raknet', 'nethernet'] as const;
export type ClientTransport = (typeof CLIENT_TRANSPORTS)[number];

const isTransport = (value: unknown): value is ClientTransport =>
    CLIENT_TRANSPORTS.some((transport) => transport === value);

/** Parses a `--transport` value. */
export const parseTransport = (value: string): ClientTransport => {
    if (!isTransport(value)) throw new Error(`--transport must be ${CLIENT_TRANSPORTS.join(' or ')}, not ${value}`);
    return value;
};

/** One client run: the wire protocol it speaks and the transport it joins over. */
export interface PinTarget {
    protocol: number;
    transport: ClientTransport;
}

/** The pinned cinnabar source: repository URL and commit. */
export interface CinnabarPin {
    repository: string;
    commit: string;
}

/** One `versions` entry of `cinnabar.json`: a protocol's build and the transports it runs over. */
export interface PinnedVersion {
    protocol: number;
    commit: string;
    transports: ClientTransport[];
}

/** What `cinnabar.json` declares. */
export interface PinManifest {
    repository: string;
    versions: PinnedVersion[];
}

/** The name a build's cache directory goes by: its commit's first 12 characters. */
export const buildName = (commit: string): string => commit.slice(0, 12);

/** The name of one protocol and transport's run, for job labels and artifacts: `v2225-nethernet`. */
export const runName = ({ protocol, transport }: PinTarget): string =>
    transport === 'raknet' ? `v${protocol}` : `v${protocol}-${transport}`;

export const isCommit = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

/**
 * Checks the shape of a parsed `cinnabar.json`.
 *
 * @param file - The parsed JSON.
 * @param source - The file's path, for the error messages.
 * @throws When an entry has no full commit, or lists no transports, an unknown one or one twice.
 */
export const parseManifest = (file: unknown, source: string): PinManifest => {
    if (!isRecord(file) || typeof file.repository !== 'string' || !isRecord(file.versions)) {
        throw new Error(`${source} must contain a repository and protocol-keyed versions`);
    }
    const versions = Object.entries(file.versions).map(([key, version]): PinnedVersion => {
        const protocol = Number(key);
        if (!Number.isSafeInteger(protocol) || protocol <= 0) {
            throw new Error(`${source} version key ${key} must be a wire protocol number`);
        }
        if (!isRecord(version)) throw new Error(`${source} version ${key} must be an object`);
        if (!isCommit(version.commit)) {
            throw new Error(`${source} version ${key} needs a full 40-character cinnabar commit in commit`);
        }
        const { transports } = version;
        if (
            !Array.isArray(transports) ||
            transports.length === 0 ||
            !transports.every(isTransport) ||
            new Set(transports).size !== transports.length
        ) {
            throw new Error(
                `${source} version ${key} must list the transports its build runs over, each once, ` +
                    `from ${CLIENT_TRANSPORTS.join(' and ')}`
            );
        }
        return { protocol, commit: version.commit, transports };
    });
    return { repository: file.repository, versions };
};

/** Reads `cinnabar.json`. */
export const readManifest = (): PinManifest => parseManifest(JSON.parse(fs.readFileSync(pinFile, 'utf8')), pinFile);

/**
 * Picks the build and transport for one run.
 *
 * @param manifest - The pins.
 * @param protocol - The wire protocol to run.
 * @param transport - The transport asked for, or `undefined` for the first one the version lists.
 * @throws When the protocol has no entry, or its build does not run over `transport`.
 */
export const resolvePin = (
    manifest: PinManifest,
    protocol: number,
    transport: ClientTransport | undefined
): PinTarget & CinnabarPin => {
    const version = manifest.versions.find((candidate) => candidate.protocol === protocol);
    if (version === undefined) throw new Error(`${pinFile} has no cinnabar pin for wire protocol ${protocol}`);
    const [first] = version.transports;
    const chosen = transport ?? first;
    if (chosen === undefined || !version.transports.includes(chosen)) {
        throw new Error(
            `protocol ${protocol} runs over ${version.transports.join(' and ')} only; ` +
                `cinnabar.json lists no ${String(chosen)} transport for it`
        );
    }
    return { protocol, transport: chosen, repository: manifest.repository, commit: version.commit };
};

/** One run CI makes: a protocol over one of its transports, with the build it uses. */
export interface MatrixEntry extends PinTarget {
    commit: string;
    /** The run's label, from {@link runName}. */
    name: string;
    /** The build's cache directory, from {@link buildName}, shared by every run of the commit. */
    build: string;
}

/**
 * The client runs CI makes: every declared transport of every protocol this checkout serves,
 * oldest protocol first.
 * @param latestOnly - Keep only the newest served protocol's runs.
 * @throws When a served protocol has no pin.
 */
export const pinMatrix = (latestOnly = false, manifest = readManifest()): MatrixEntry[] => {
    const served = servedProtocols();
    const protocols = latestOnly ? served.slice(-1) : served;
    return protocols.flatMap((protocol) => {
        const version = manifest.versions.find((candidate) => candidate.protocol === protocol);
        if (version === undefined) {
            throw new Error(`${pinFile} has no cinnabar pin for served wire protocol ${protocol}`);
        }
        return version.transports.map((transport) => ({
            protocol,
            transport,
            commit: version.commit,
            name: runName({ protocol, transport }),
            build: buildName(version.commit)
        }));
    });
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const buildCacheDirectory = (commit: string): string => path.resolve(cacheRoot(), buildName(commit));

/** Where one build's checkout lives, honoring a `JSP_CINNABAR_PATH` override. */
export const checkoutDir = (commit: string): string => {
    const override = process.env.JSP_CINNABAR_PATH;
    if (override) return path.resolve(override);
    return path.join(buildCacheDirectory(commit), 'repo');
};

/** Cargo's intermediate build directory for one build, outside its checkout. */
export const buildDirectory = (commit: string): string => path.join(buildCacheDirectory(commit), 'build');

/** Cargo's final target directory for one build, outside its checkout. */
export const targetDirectory = (commit: string): string => path.join(buildCacheDirectory(commit), 'target');

/** Client path that preserves Cinnabar's development-checkout root detection. */
export const developmentClientBinary = (checkout: string): string => path.join(checkout, 'target', 'debug', 'cinnabar');

/** The build outputs the harness needs from a cinnabar protocol build directory. */
export const binaries = (targetDir: string) => ({
    mcp: path.join(targetDir, 'debug', 'cinnabar-mcp'),
    client: path.join(targetDir, 'debug', 'cinnabar'),
    core: path.join(targetDir, 'debug', 'bedrock-core')
});

/** The Bedrock version the checkout targets, read from its `assets/bedrock-target.json`. */
export const bedrockTarget = (checkout: string): { wireProtocol: number; gameVersion: string } => {
    const file = path.join(checkout, 'assets', 'bedrock-target.json');
    const target: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
        typeof target !== 'object' ||
        target === null ||
        !('wire_protocol' in target) ||
        !('game_version' in target) ||
        typeof target.wire_protocol !== 'number' ||
        typeof target.game_version !== 'string'
    ) {
        throw new Error(`${file} must contain wire_protocol and game_version`);
    }
    return { wireProtocol: target.wire_protocol, gameVersion: target.game_version };
};

/** The wire protocols this JSPrismarine checkout serves, from the bedrock-data manifest. */
export const servedProtocols = (): number[] => {
    const sources = path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json');
    const manifest: unknown = JSON.parse(fs.readFileSync(sources, 'utf8'));
    if (!isRecord(manifest) || !isRecord(manifest.bds) || !isRecord(manifest.bds.versions)) {
        throw new Error(`${sources} has no bds.versions`);
    }
    const protocols = Object.keys(manifest.bds.versions).map(Number);
    if (protocols.some((protocol) => !Number.isSafeInteger(protocol) || protocol <= 0)) {
        throw new Error(`${sources} contains a non-numeric BDS protocol key`);
    }
    return protocols.sort((left, right) => left - right);
};

const run = (command: string, args: string[], cwd: string, env = process.env): void => {
    const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} exited with ${result.status} in ${cwd}`);
    }
};

// Each tool spells its version probe differently: `go version`, `ffmpeg -version`.
const versionArgs: Record<string, string[]> = { go: ['version'], ffmpeg: ['-version'] };

const commandExists = (command: string): boolean =>
    spawnSync(command, versionArgs[command] ?? ['--version'], { stdio: 'ignore' }).status === 0;

/** Creates hardlinks at the paths Cinnabar uses to discover its checkout and Go core. */
const ensureDevelopmentLinks = (checkout: string, built: ReturnType<typeof binaries>): void => {
    const targetDir = path.join(checkout, 'target', 'debug');
    fs.mkdirSync(targetDir, { recursive: true });
    const links: [source: string, destination: string][] = [
        [built.client, developmentClientBinary(checkout)],
        [built.core, path.join(targetDir, 'bedrock-core')]
    ];
    for (const [source, destination] of links) {
        if (path.resolve(source) === path.resolve(destination)) continue;
        if (fs.existsSync(destination)) {
            const existing = fs.statSync(destination);
            const compiled = fs.statSync(source);
            if (existing.dev === compiled.dev && existing.ino === compiled.ino) continue;
            fs.unlinkSync(destination);
        }
        fs.linkSync(source, destination);
    }
};

/** The commit a checkout is at. */
export const checkoutHead = (checkout: string): string =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();

/**
 * The commit of the build a run uses: a `JSP_CINNABAR_PATH` checkout's own, which may differ
 * from the pin, and the pinned one otherwise.
 */
export const buildCommit = (pin: CinnabarPin, checkout: string): string =>
    process.env.JSP_CINNABAR_PATH ? checkoutHead(checkout) : pin.commit;

/** Clones the pinned commit when the cache is cold. A `JSP_CINNABAR_PATH` checkout is used as-is. */
export const ensureCheckout = (pin: CinnabarPin): string => {
    const checkout = checkoutDir(pin.commit);
    if (process.env.JSP_CINNABAR_PATH) {
        if (!fs.existsSync(checkout)) {
            throw new Error(`JSP_CINNABAR_PATH points at ${checkout}, which does not exist`);
        }
        const head = checkoutHead(checkout);
        if (head !== pin.commit) {
            console.warn(`JSP_CINNABAR_PATH is at ${head.slice(0, 12)}, not the pinned ${pin.commit.slice(0, 12)}`);
        }
        return checkout;
    }
    if (fs.existsSync(path.join(checkout, '.git'))) return checkout;
    fs.mkdirSync(path.dirname(checkout), { recursive: true });
    // Cloned beside the checkout and renamed into place, since the protocols' transports share
    // one checkout per commit: a run that starts on a cold cache while another still clones finds
    // no `.git` to mistake for a whole checkout, and a rename onto one that landed first fails,
    // after which this run uses that one.
    const staging = fs.mkdtempSync(`${checkout}.clone-`);
    try {
        run('git', ['clone', '--filter=blob:none', pin.repository, staging], path.dirname(checkout));
        run('git', ['checkout', '--detach', pin.commit], staging);
        try {
            fs.renameSync(staging, checkout);
        } catch (error) {
            if (!fs.existsSync(path.join(checkout, '.git'))) throw error;
        }
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
    return checkout;
};

/**
 * Whether `ancestor` is `commit` or one of its ancestors, as the checkout's history tells it.
 *
 * @returns `undefined` when the checkout cannot tell, such as when it has never fetched `ancestor`.
 */
export const containsCommit = (checkout: string, commit: string, ancestor: string): boolean | undefined => {
    const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, commit], {
        cwd: checkout,
        stdio: 'ignore'
    });
    return result.status === 0 ? true : result.status === 1 ? false : undefined;
};

const stampFile = (cache: string): string => path.join(cache, '.jsprismarine-e2e-stamp');

/** Cargo's output directories inside a build's cache. A cold build copies both from a donor. */
const seededDirectories = ['build', 'target'] as const;

/**
 * Caches other than `commit`'s with a finished build that can seed a new one: those built from
 * `commit` itself first, then the most recently built. The `v<protocol>` caches an older harness
 * kept per protocol and transport qualify too, so the first build in this layout starts from them.
 */
const builtDonors = (commit: string): string[] => {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(cacheRoot(), { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .filter((entry) => entry.isDirectory() && entry.name !== buildName(commit))
        .flatMap((entry) => {
            const cache = path.resolve(cacheRoot(), entry.name);
            if (!seededDirectories.every((directory) => fs.existsSync(path.join(cache, directory)))) return [];
            const stamp = readStamp(cache);
            if (stamp === undefined) return [];
            const sameCommit = stamp.split('\n')[0] === commit;
            return [{ cache, sameCommit, builtAt: fs.statSync(stampFile(cache)).mtimeMs }];
        })
        .sort((left, right) => Number(right.sameCommit) - Number(left.sameCommit) || right.builtAt - left.builtAt)
        .map(({ cache }) => cache);
};

/**
 * Starts a build with no outputs of its own from the most recently finished one.
 *
 * Cargo keys registry dependencies by name, version, features, and toolchain, not by checkout
 * path, so the donor's `build/` and `target/` let the new build compile only its workspace crates
 * and the dependencies whose versions differ. Each directory is copied under a temporary name and
 * renamed, so an interrupted copy leaves nothing behind that looks like a partial cache.
 */
const seedFromDonor = (commit: string): void => {
    const cache = buildCacheDirectory(commit);
    if (seededDirectories.some((name) => fs.existsSync(path.join(cache, name)))) return;
    const [donor] = builtDonors(commit);
    if (donor === undefined) return;

    console.log(`seeding the ${buildName(commit)} build cache from ${path.basename(donor)}...`);
    fs.mkdirSync(cache, { recursive: true });
    const staged = seededDirectories.map((name) => {
        const staging = path.join(cache, `${name}.seeding`);
        fs.rmSync(staging, { recursive: true, force: true });
        // Cargo compares file times to decide what is stale, so the copy must keep them. A clone
        // makes the copy free where the filesystem supports it (APFS) and falls back to a real copy.
        fs.cpSync(path.join(donor, name), staging, {
            recursive: true,
            preserveTimestamps: true,
            mode: fs.constants.COPYFILE_FICLONE
        });
        return [staging, path.join(cache, name)] as const;
    });
    for (const [staging, destination] of staged) fs.renameSync(staging, destination);
};

/**
 * Builds the client (with developer control), the MCP controller, and the Go core.
 *
 * The first build fetches the vanilla asset pack and compiles the whole client, which takes a
 * while and needs the network. Each commit's build lives in one cache directory, so repeated
 * calls are a fast no-op, and every protocol, transport and worktree that pins the commit uses
 * the same build. A commit without a build starts from a copy of the most recent one, so only the
 * differing crates compile.
 *
 * @param commit - The pinned commit, whose cache holds the build.
 * @throws When a required toolchain (cargo, go) is missing or a build step fails.
 */
export const ensureBuilt = (checkout: string, commit: string): void => {
    const cache = buildCacheDirectory(commit);
    const cargoBuildDir = buildDirectory(commit);
    const targetDir = targetDirectory(commit);
    const built = binaries(targetDir);
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
    const expectedStamp = `${expected}\ncommit-cache-v1`;
    if (readStamp(cache) === expectedStamp && Object.values(built).every((binary) => fs.existsSync(binary))) {
        ensureDevelopmentLinks(checkout, built);
        return;
    }

    for (const tool of ['cargo', 'go', 'make'] as const) {
        if (!commandExists(tool)) throw new Error(`building cinnabar needs ${tool} on PATH`);
    }
    if (!commandExists('ffmpeg')) {
        console.warn('ffmpeg is not on PATH; the client builds, but record_start will fail');
    }
    seedFromDonor(commit);
    fs.mkdirSync(cargoBuildDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    const sharedCompilerCacheEnv = commandExists('sccache')
        ? {
              RUSTC_WRAPPER: process.env.RUSTC_WRAPPER ?? 'sccache',
              // Strip both source and build-specific artifact roots so shared crate keys match.
              SCCACHE_BASEDIRS: [process.env.SCCACHE_BASEDIRS, checkout, cache].filter(Boolean).join(path.delimiter),
              ...(process.env.SCCACHE_GHA_ENABLED === 'true'
                  ? {}
                  : { SCCACHE_DIR: process.env.SCCACHE_DIR ?? path.join(cacheRoot(), 'sccache') })
          }
        : {};
    const buildEnv = {
        ...process.env,
        ...sharedCompilerCacheEnv,
        CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2',
        CARGO_BUILD_BUILD_DIR: cargoBuildDir,
        CARGO_BUILD_TARGET_DIR: targetDir,
        CARGO_TARGET_DIR: targetDir
    };
    // On CI, rustup installs the version the checkout's rust-toolchain.toml pins. Locally the
    // ambient toolchain builds the checkout as-is, even where rustup is also installed.
    if (process.env.CI && commandExists('rustup')) run('rustup', ['toolchain', 'install'], checkout);

    run('make', ['assets'], checkout, buildEnv);
    run('cargo', ['build', '-p', 'cinnabar', '--features', 'developer-control'], checkout, buildEnv);
    run('cargo', ['build', '-p', 'cinnabar-mcp'], checkout, buildEnv);
    run('go', ['build', '-o', built.core, './core/cmd/bedrock-core'], checkout);

    ensureDevelopmentLinks(checkout, built);
    fs.writeFileSync(stampFile(cache), `${expected}\ncommit-cache-v1\n`);
};

const readStamp = (cache: string): string | undefined => {
    try {
        return fs.readFileSync(stampFile(cache), 'utf8').trim();
    } catch {
        return undefined;
    }
};

/**
 * Resolves, builds, and version-checks the cinnabar build for a served protocol.
 *
 * @param requestedProtocol - Wire protocol to test. Defaults to the highest served protocol.
 * @param requestedTransport - Transport to run over. Defaults to the first one the protocol lists.
 * @returns The pin, the checkout path, its binaries, and the Bedrock version it targets.
 * @throws When this JSPrismarine checkout does not serve the protocol, or the protocol's build does
 * not run over the transport.
 */
export const ensureCinnabar = (requestedProtocol?: number, requestedTransport?: ClientTransport) => {
    const served = servedProtocols();
    if (served.length === 0) throw new Error('packages/bedrock-data/sources.json declares no BDS protocols');
    const protocolVersion = requestedProtocol ?? served.at(-1)!;
    if (!Number.isSafeInteger(protocolVersion) || !served.includes(protocolVersion)) {
        throw new Error(`wire protocol ${protocolVersion} is not served; this checkout serves ${served.join(', ')}`);
    }
    const pin = resolvePin(readManifest(), protocolVersion, requestedTransport);
    const checkout = ensureCheckout(pin);
    const target = bedrockTarget(checkout);
    if (target.wireProtocol !== protocolVersion) {
        throw new Error(
            `cinnabar commit ${pin.commit} targets wire protocol ${target.wireProtocol} (${target.gameVersion}), ` +
                `but the pin is for ${protocolVersion}. Update the cinnabar pin.`
        );
    }
    ensureBuilt(checkout, pin.commit);
    return {
        pin,
        checkout,
        binaries: binaries(targetDirectory(pin.commit)),
        clientBinary: developmentClientBinary(checkout),
        target
    };
};
