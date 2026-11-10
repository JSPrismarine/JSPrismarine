/**
 * Resolves and builds the pinned cinnabar checkout that the e2e harness drives.
 *
 * Protocol pins live in `cinnabar.json`, one per wire protocol and transport. Checkouts are cached
 * under `$XDG_CACHE_HOME/jsprismarine/cinnabar/<pin>/<commit>/repo`; each pin's Cargo and Go
 * outputs stay under its shared `$XDG_CACHE_HOME/jsprismarine/cinnabar/<pin>` directory, where
 * `<pin>` is `v<protocol>` for RakNet and `v<protocol>-nethernet` for NetherNet.
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

/** Parses a `--transport` value, defaulting to RakNet. */
export const parseTransport = (value: string | undefined): ClientTransport => {
    const transport = CLIENT_TRANSPORTS.find((candidate) => candidate === (value ?? 'raknet'));
    if (transport === undefined) throw new Error(`--transport must be ${CLIENT_TRANSPORTS.join(' or ')}`);
    return transport;
};

/** One client build: the wire protocol it speaks and the transport its pin is for. */
export interface PinTarget {
    protocol: number;
    transport: ClientTransport;
}

/** The pinned cinnabar source: repository URL and commit. */
export interface CinnabarPin {
    repository: string;
    commit: string;
}

/** The name a pin's caches go by: `v<protocol>`, with `-nethernet` for a NetherNet pin. */
export const pinName = ({ protocol, transport }: PinTarget): string =>
    transport === 'raknet' ? `v${protocol}` : `v${protocol}-${transport}`;

const isCommit = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

/** Every pin `cinnabar.json` declares, NetherNet ones read from each version's `nethernet` entry. */
const readPins = (): { repository: string; pins: (PinTarget & { commit: string })[] } => {
    const file: unknown = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
    if (!isRecord(file) || typeof file.repository !== 'string' || !isRecord(file.versions)) {
        throw new Error(`${pinFile} must contain a repository and protocol-keyed versions`);
    }
    const pins = Object.entries(file.versions).flatMap(([key, version]) => {
        const protocol = Number(key);
        if (!isRecord(version)) throw new Error(`${pinFile} version ${key} must be an object`);
        const raknet =
            version.commit === undefined ? [] : [{ protocol, transport: 'raknet' as const, commit: version.commit }];
        const nethernet =
            version.nethernet === undefined
                ? []
                : [
                      {
                          protocol,
                          transport: 'nethernet' as const,
                          commit: isRecord(version.nethernet) ? version.nethernet.commit : undefined
                      }
                  ];
        return [...raknet, ...nethernet].map((pin) => {
            if (!isCommit(pin.commit)) throw new Error(`${pinFile} has no full commit for ${pinName(pin)}`);
            return { ...pin, commit: pin.commit };
        });
    });
    return { repository: file.repository, pins };
};

/** Reads the cinnabar commit pinned for one Bedrock wire protocol and transport. */
export const readPin = (target: PinTarget): CinnabarPin => {
    const { repository, pins } = readPins();
    const pin = pins.find(
        (candidate) => candidate.protocol === target.protocol && candidate.transport === target.transport
    );
    if (pin === undefined) {
        throw new Error(`${pinFile} has no ${target.transport} pin for wire protocol ${target.protocol}`);
    }
    return { repository, commit: pin.commit };
};

/**
 * The client builds CI runs: every pin for a protocol this checkout serves, oldest protocol first.
 * @param latestOnly - Keep only the newest served protocol's pins.
 * @throws When a served protocol has no pin at all.
 */
export const pinMatrix = (latestOnly = false): (PinTarget & { commit: string; name: string })[] => {
    const served = servedProtocols();
    const protocols = latestOnly ? served.slice(-1) : served;
    const { pins } = readPins();
    for (const protocol of protocols) {
        if (!pins.some((pin) => pin.protocol === protocol)) {
            throw new Error(`${pinFile} has no cinnabar pin for served wire protocol ${protocol}`);
        }
    }
    return pins
        .filter((pin) => protocols.includes(pin.protocol))
        .sort(
            (left, right) =>
                left.protocol - right.protocol ||
                CLIENT_TRANSPORTS.indexOf(left.transport) - CLIENT_TRANSPORTS.indexOf(right.transport)
        )
        .map((pin) => ({ ...pin, name: pinName(pin) }));
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Where one pin's checkout lives, honoring a `JSP_CINNABAR_PATH` override. */
export const checkoutDir = (pin: CinnabarPin, target: PinTarget): string => {
    const override = process.env.JSP_CINNABAR_PATH;
    if (override) return path.resolve(override);
    return path.resolve(cacheRoot(), pinName(target), pin.commit.slice(0, 12), 'repo');
};

const pinCacheDirectory = (name: string): string => path.resolve(cacheRoot(), name);

/** Cargo's intermediate build directory for one pin, outside all cinnabar checkouts. */
export const buildDirectory = (target: PinTarget): string => path.join(pinCacheDirectory(pinName(target)), 'build');

/** Cargo's final target directory for one pin, outside all cinnabar checkouts. */
export const targetDirectory = (target: PinTarget): string => path.join(pinCacheDirectory(pinName(target)), 'target');

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

/** Clones the pinned commit when the cache is cold. A `JSP_CINNABAR_PATH` checkout is used as-is. */
export const ensureCheckout = (pin: CinnabarPin, target: PinTarget): string => {
    const checkout = checkoutDir(pin, target);
    if (process.env.JSP_CINNABAR_PATH) {
        if (!fs.existsSync(checkout)) {
            throw new Error(`JSP_CINNABAR_PATH points at ${checkout}, which does not exist`);
        }
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
        if (head !== pin.commit) {
            console.warn(`JSP_CINNABAR_PATH is at ${head.slice(0, 12)}, not the pinned ${pin.commit.slice(0, 12)}`);
        }
        return checkout;
    }
    if (fs.existsSync(path.join(checkout, '.git'))) return checkout;
    fs.mkdirSync(path.dirname(checkout), { recursive: true });
    run('git', ['clone', '--filter=blob:none', pin.repository, checkout], path.dirname(checkout));
    run('git', ['checkout', '--detach', pin.commit], checkout);
    return checkout;
};

const stampFile = (protocolCache: string): string => path.join(protocolCache, '.jsprismarine-e2e-stamp');

/** Cargo's output directories inside a pin cache. A cold pin copies both from a donor. */
const seededDirectories = ['build', 'target'] as const;

/** Pin caches other than `target`'s with a finished build that can seed a new cache. */
const builtDonors = (target: PinTarget): { name: string; protocol: number }[] => {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(cacheRoot(), { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .flatMap((entry) => {
            const match = entry.isDirectory() ? /^v(\d+)(?:-[a-z]+)?$/.exec(entry.name) : null;
            return match ? [{ name: entry.name, protocol: Number(match[1]) }] : [];
        })
        .filter(({ name }) => {
            const cache = pinCacheDirectory(name);
            return (
                name !== pinName(target) &&
                readStamp(cache) !== undefined &&
                seededDirectories.every((directory) => fs.existsSync(path.join(cache, directory)))
            );
        });
};

/**
 * Starts a pin with no build of its own from the pin of the closest protocol that has one.
 *
 * Cargo keys registry dependencies by name, version, features, and toolchain, not by checkout
 * path, so the donor's `build/` and `target/` let the new pin compile only its workspace crates and
 * the dependencies whose versions differ. A protocol that already has either directory, even from
 * an older pin, keeps its own cache. Each directory is copied under a temporary name and renamed,
 * so an interrupted copy leaves nothing behind that looks like a partial cache.
 */
const seedFromDonor = (target: PinTarget): void => {
    const protocolCache = pinCacheDirectory(pinName(target));
    if (seededDirectories.some((name) => fs.existsSync(path.join(protocolCache, name)))) return;
    const distance = (protocol: number): number => Math.abs(protocol - target.protocol);
    const [donor] = builtDonors(target).sort(
        (left, right) => distance(left.protocol) - distance(right.protocol) || right.protocol - left.protocol
    );
    if (donor === undefined) return;

    console.log(`seeding the ${pinName(target)} build cache from ${donor.name}...`);
    fs.mkdirSync(protocolCache, { recursive: true });
    const staged = seededDirectories.map((name) => {
        const staging = path.join(protocolCache, `${name}.seeding`);
        fs.rmSync(staging, { recursive: true, force: true });
        // Cargo compares file times to decide what is stale, so the copy must keep them. A clone
        // makes the copy free where the filesystem supports it (APFS) and falls back to a real copy.
        fs.cpSync(path.join(pinCacheDirectory(donor.name), name), staging, {
            recursive: true,
            preserveTimestamps: true,
            mode: fs.constants.COPYFILE_FICLONE
        });
        return [staging, path.join(protocolCache, name)] as const;
    });
    for (const [staging, destination] of staged) fs.renameSync(staging, destination);
};

/**
 * Builds the client (with developer control), the MCP controller, and the Go core.
 *
 * The first build fetches the vanilla asset pack and compiles the whole client, which takes a
 * while and needs the network. One external build cache per protocol makes repeated calls a fast
 * no-op and lets separate worktrees reuse the same build. A protocol without a cache starts from
 * a copy of the closest built protocol's cache, so only the differing dependencies compile.
 *
 * @param target - The pin whose cache should hold the build.
 * @throws When a required toolchain (cargo, go) is missing or a build step fails.
 */
export const ensureBuilt = (checkout: string, target: PinTarget): void => {
    const protocolCache = pinCacheDirectory(pinName(target));
    const cargoBuildDir = buildDirectory(target);
    const targetDir = targetDirectory(target);
    const built = binaries(targetDir);
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
    const expectedStamp = `${expected}\nprotocol-cache-v1`;
    if (readStamp(protocolCache) === expectedStamp && Object.values(built).every((binary) => fs.existsSync(binary))) {
        ensureDevelopmentLinks(checkout, built);
        return;
    }

    for (const tool of ['cargo', 'go', 'make'] as const) {
        if (!commandExists(tool)) throw new Error(`building cinnabar needs ${tool} on PATH`);
    }
    if (!commandExists('ffmpeg')) {
        console.warn('ffmpeg is not on PATH; the client builds, but record_start will fail');
    }
    seedFromDonor(target);
    fs.mkdirSync(cargoBuildDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    const sharedCompilerCacheEnv = commandExists('sccache')
        ? {
              RUSTC_WRAPPER: process.env.RUSTC_WRAPPER ?? 'sccache',
              // Strip both source and protocol-specific artifact roots so shared crate keys match.
              SCCACHE_BASEDIRS: [process.env.SCCACHE_BASEDIRS, checkout, protocolCache]
                  .filter(Boolean)
                  .join(path.delimiter),
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
    fs.writeFileSync(stampFile(protocolCache), `${expected}\nprotocol-cache-v1\n`);
};

const readStamp = (protocolCache: string): string | undefined => {
    try {
        return fs.readFileSync(stampFile(protocolCache), 'utf8').trim();
    } catch {
        return undefined;
    }
};

/**
 * Resolves, builds, and version-checks the cinnabar pin for a served protocol.
 *
 * @param requestedProtocol - Wire protocol to test. Defaults to the highest served protocol.
 * @param transport - Which of the protocol's pins to build.
 * @returns The checkout path, its binaries, and the Bedrock version it targets.
 * @throws When this JSPrismarine checkout does not serve the client's wire protocol.
 */
export const ensureCinnabar = (requestedProtocol?: number, transport: ClientTransport = 'raknet') => {
    const served = servedProtocols();
    if (served.length === 0) throw new Error('packages/bedrock-data/sources.json declares no BDS protocols');
    const protocolVersion = requestedProtocol ?? served.at(-1)!;
    if (!Number.isSafeInteger(protocolVersion) || !served.includes(protocolVersion)) {
        throw new Error(`wire protocol ${protocolVersion} is not served; this checkout serves ${served.join(', ')}`);
    }
    const pinTarget: PinTarget = { protocol: protocolVersion, transport };
    const pin = readPin(pinTarget);
    const checkout = ensureCheckout(pin, pinTarget);
    const target = bedrockTarget(checkout);
    if (target.wireProtocol !== protocolVersion) {
        throw new Error(
            `cinnabar commit ${pin.commit} targets wire protocol ${target.wireProtocol} (${target.gameVersion}), ` +
                `but the pin is for ${protocolVersion}. Update the cinnabar pin.`
        );
    }
    ensureBuilt(checkout, pinTarget);
    return {
        checkout,
        binaries: binaries(targetDirectory(pinTarget)),
        clientBinary: developmentClientBinary(checkout),
        target
    };
};
