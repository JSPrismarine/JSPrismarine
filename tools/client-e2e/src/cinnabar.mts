/**
 * Resolves and builds the pinned cinnabar checkout that the e2e harness drives.
 *
 * The pin lives in `cinnabar.json`. The checkout is cached under
 * `node_modules/.cache/jsprismarine/cinnabar/<commit>/repo`, or taken from
 * `JSP_CINNABAR_PATH` when set (an existing checkout, used as-is).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The JSPrismarine repository root this harness belongs to. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const pinFile = path.join(repoRoot, 'tools', 'client-e2e', 'cinnabar.json');

/** The pinned cinnabar source: repository URL and commit. */
export interface CinnabarPin {
    repository: string;
    commit: string;
}

/** Reads the pinned cinnabar repository and commit from `cinnabar.json`. */
export const readPin = (): CinnabarPin => {
    const pin: unknown = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
    if (
        typeof pin !== 'object' ||
        pin === null ||
        !('repository' in pin) ||
        !('commit' in pin) ||
        typeof pin.repository !== 'string' ||
        typeof pin.commit !== 'string'
    ) {
        throw new Error(`${pinFile} must contain { "repository": string, "commit": string }`);
    }
    return { repository: pin.repository, commit: pin.commit };
};

/** Where the pinned checkout lives, honoring a `JSP_CINNABAR_PATH` override. */
export const checkoutDir = (pin: CinnabarPin): string => {
    const override = process.env.JSP_CINNABAR_PATH;
    if (override) return path.resolve(override);
    return path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine', 'cinnabar', pin.commit.slice(0, 12), 'repo');
};

/** The build outputs the harness needs from a cinnabar checkout. */
export const binaries = (checkout: string) => ({
    mcp: path.join(checkout, 'target', 'debug', 'cinnabar-mcp'),
    client: path.join(checkout, 'target', 'debug', 'cinnabar'),
    core: path.join(checkout, 'target', 'debug', 'bedrock-core')
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
    if (typeof manifest !== 'object' || manifest === null || !('bds' in manifest)) {
        throw new Error(`${sources} has no bds section`);
    }
    const bds = manifest.bds;
    if (typeof bds !== 'object' || bds === null || !('versions' in bds) || typeof bds.versions !== 'object') {
        throw new Error(`${sources} has no bds.versions`);
    }
    return Object.keys(bds.versions as object).map(Number);
};

const run = (command: string, args: string[], cwd: string): void => {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} exited with ${result.status} in ${cwd}`);
    }
};

// Each tool spells its version probe differently: `go version`, `ffmpeg -version`.
const versionArgs: Record<string, string[]> = { go: ['version'], ffmpeg: ['-version'] };

const commandExists = (command: string): boolean =>
    spawnSync(command, versionArgs[command] ?? ['--version'], { stdio: 'ignore' }).status === 0;

/** Clones the pinned commit when the cache is cold. A `JSP_CINNABAR_PATH` checkout is used as-is. */
export const ensureCheckout = (pin: CinnabarPin): string => {
    const checkout = checkoutDir(pin);
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

const stampFile = (checkout: string): string => path.join(checkout, 'target', '.jsprismarine-e2e-stamp');

/**
 * Builds the client (with developer control), the MCP controller, and the Go core.
 *
 * The first build fetches the vanilla asset pack and compiles the whole client, which takes a
 * while and needs the network. A stamp under `target/` makes later calls a fast no-op.
 *
 * @throws When a required toolchain (cargo, go) is missing or a build step fails.
 */
export const ensureBuilt = (checkout: string): void => {
    const built = binaries(checkout);
    const stamp = readStamp(checkout);
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
    if (stamp === expected && Object.values(built).every((binary) => fs.existsSync(binary))) return;

    for (const tool of ['cargo', 'go', 'make'] as const) {
        if (!commandExists(tool)) throw new Error(`building cinnabar needs ${tool} on PATH`);
    }
    if (!commandExists('ffmpeg')) {
        console.warn('ffmpeg is not on PATH; the client builds, but record_start will fail');
    }
    // On CI, rustup installs the version the checkout's rust-toolchain.toml pins. Locally the
    // ambient toolchain builds the checkout as-is, even where rustup is also installed.
    if (process.env.CI && commandExists('rustup')) run('rustup', ['toolchain', 'install'], checkout);

    run('make', ['assets'], checkout);
    run('cargo', ['build', '-p', 'cinnabar', '--features', 'developer-control'], checkout);
    run('cargo', ['build', '-p', 'cinnabar-mcp'], checkout);
    run('go', ['build', '-o', built.core, './core/cmd/bedrock-core'], checkout);

    fs.writeFileSync(stampFile(checkout), `${expected}\n`);
};

const readStamp = (checkout: string): string | undefined => {
    try {
        return fs.readFileSync(stampFile(checkout), 'utf8').trim();
    } catch {
        return undefined;
    }
};

/**
 * Resolves, builds, and version-checks the pinned cinnabar checkout.
 *
 * @returns The checkout path, its binaries, and the Bedrock version it targets.
 * @throws When this JSPrismarine checkout does not serve the client's wire protocol.
 */
export const ensureCinnabar = () => {
    const pin = readPin();
    const checkout = ensureCheckout(pin);
    ensureBuilt(checkout);
    const target = bedrockTarget(checkout);
    const served = servedProtocols();
    if (!served.includes(target.wireProtocol)) {
        throw new Error(
            `cinnabar speaks wire protocol ${target.wireProtocol} (${target.gameVersion}), but this ` +
                `checkout serves ${served.join(', ')}. Update the cinnabar pin or bring up the protocol.`
        );
    }
    return { checkout, binaries: binaries(checkout), target };
};
