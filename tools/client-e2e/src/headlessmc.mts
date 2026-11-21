/**
 * Drives the real Java Edition client through HeadlessMC, with HMC-Specifics for the console
 * commands, as [the Java multiprotocol plan](../../../docs/plans/java-multiprotocol.md#drivers)
 * chose for scripted runs.
 *
 * HeadlessMC launches the pinned client on Fabric with LWJGL patched to render nothing, under an
 * offline account, which it allows for exactly this: running the game headless for automated
 * tests. Everything it downloads, the client, its libraries and Fabric, lives under the repository
 * cache, apart from any Minecraft install on the machine. Assets are written as dummies.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { findJdkHome, jdkBinaryPath } from '../../../packages/bedrock-data/utils/java/jdk.ts';
import { repoRoot } from './cinnabar.mts';

/** The pins in `headlessmc.json`. */
interface HeadlessMcPins {
    headlessmc: { version: string; url: string; sha256: string };
    releases: Record<string, { fabricLoader: string; specifics: { url: string; sha256: string } }>;
}

const pins: HeadlessMcPins = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tools/client-e2e/headlessmc.json'), 'utf8')
);
const cacheDir = path.join(repoRoot, 'node_modules/.cache/jsprismarine/headlessmc');

/** Downloads `url` to `file` unless the file is there with the pinned hash, and checks the hash. */
const ensurePinned = async (url: string, sha256: string, file: string): Promise<void> => {
    const hashOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    if (fs.existsSync(file) && hashOf(fs.readFileSync(file)) === sha256) return;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = hashOf(bytes);
    if (actual !== sha256) throw new Error(`${url} has sha256 ${actual}, not the pinned ${sha256}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
};

/** The launcher jar and HeadlessMC's own directory, with HMC-Specifics in the release's mods folder. */
export const ensureHeadlessMc = async (release: string): Promise<{ jar: string; home: string; mods: string }> => {
    const pin = pins.releases[release];
    if (pin === undefined) throw new Error(`headlessmc.json pins no Java release ${release}`);
    const jar = path.join(cacheDir, pins.headlessmc.version, 'headlessmc.jar');
    await ensurePinned(pins.headlessmc.url, pins.headlessmc.sha256, jar);
    const home = path.join(cacheDir, 'home');
    // HeadlessMC gives each launched version a game directory of its own, named for the loader
    // and its build when the build is pinned, as it is here.
    const mods = path.join(home, 'minecraft', `fabric-${release}-${pin.fabricLoader}`, 'mods');
    await ensurePinned(pin.specifics.url, pin.specifics.sha256, path.join(mods, `hmc-specifics-${release}-fabric.jar`));
    // A fresh game directory opens on the accessibility onboarding screen, which waits for a click.
    // The headless client presses keyboard keys only, so attack and use move off the mouse.
    const options = path.join(path.dirname(mods), 'options.txt');
    const settings = new Map(
        (fs.existsSync(options) ? fs.readFileSync(options, 'utf8') : '')
            .split('\n')
            .filter((line) => line.includes(':'))
            .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)])
    );
    settings.set('onboardAccessibility', 'false');
    settings.set('key_key.attack', `key.keyboard.${ATTACK_KEY}`);
    settings.set('key_key.use', `key.keyboard.${USE_KEY}`);
    fs.writeFileSync(options, [...settings].map(([key, value]) => `${key}:${value}\n`).join(''));
    return { jar, home, mods };
};

/** The keyboard key the client attacks with, which a scenario presses with `key`. */
export const ATTACK_KEY = 'r';

/** The keyboard key the client uses the item in hand with, which a scenario presses with `key`. */
export const USE_KEY = 't';

/** A running headless Java client and its console. */
export interface JavaClient {
    /** Every line the launcher and the game have printed. */
    readonly lines: string[];
    /** Sends one console command, such as `connect localhost 25565` or `msg hello`. */
    command(line: string): void;
    /** Resolves with the first line from now on matching `pattern`, or rejects after `timeoutMs`. */
    waitForLine(pattern: RegExp, timeoutMs?: number): Promise<string>;
    /** Quits the game and waits for the launcher to exit. */
    stop(): Promise<void>;
}

/**
 * Launches the pinned client headless, and resolves once HMC-Specifics takes commands.
 * @param release - The Java release, a key of `headlessmc.json`.
 * @param log - Where the client's output also goes, line by line.
 */
export const launchJavaClient = async (release: string, log?: (line: string) => void): Promise<JavaClient> => {
    const pin = pins.releases[release]!;
    const { jar, home } = await ensureHeadlessMc(release);
    // HeadlessMC runs the client on exactly the Java release the client names, 25 for 26.3.
    const jdk = findJdkHome({ minimumMajor: 25, maximumMajor: 25 });
    const child: ChildProcess = spawn(
        jdkBinaryPath(jdk, 'java'),
        [
            `-Dhmc.files.location=${home}`,
            `-Dhmc.files.mc=${path.join(home, 'minecraft')}`,
            `-Dhmc.java.versions=${jdk}`,
            '-Dhmc.java.download=false',
            '-Dhmc.assets.dummy=true',
            '-Dhmc.jline.enabled=false',
            '-jar',
            jar,
            'launch',
            'fabric',
            release,
            pin.fabricLoader,
            '-lwjgl',
            '--offline',
            '-eula'
        ],
        // A process group of its own: the launcher starts the game as a second JVM, and a stop
        // that has to kill must reach that one too.
        { cwd: home, stdio: ['pipe', 'pipe', 'pipe'], detached: true }
    );
    const lines: string[] = [];
    const watchers = new Set<(line: string) => void>();
    let partial = '';
    const read = (chunk: Buffer) => {
        partial += chunk.toString('utf8');
        const complete = partial.split('\n');
        partial = complete.pop() ?? '';
        for (const line of complete) {
            lines.push(line);
            log?.(line);
            for (const watch of watchers) watch(line);
        }
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

    const waitForLine = (pattern: RegExp, timeoutMs = 60_000): Promise<string> =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                watchers.delete(watch);
                reject(new Error(`the Java client printed nothing matching ${pattern} in ${timeoutMs} ms`));
            }, timeoutMs);
            const watch = (line: string) => {
                if (!pattern.test(line)) return;
                clearTimeout(timer);
                watchers.delete(watch);
                resolve(line);
            };
            watchers.add(watch);
            void exited.then(() => {
                if (!watchers.has(watch)) return;
                clearTimeout(timer);
                watchers.delete(watch);
                reject(new Error(`the Java client exited before printing ${pattern}`));
            });
        });

    const command = (line: string) => void child.stdin?.write(`${line}\n`);
    // The first launch downloads the client, its libraries and Fabric.
    await waitForLine(/HMC-Specifics initialized/, 600_000);
    // The commands work from here, but the client is still loading its resources, and a connect
    // issued now never finishes. `gui` names the screen; loading is a message screen.
    for (let attempt = 0; ; attempt++) {
        const screen = waitForLine(/^Screen: /, 5_000);
        command('gui');
        if (!/GenericMessageScreen|LoadingOverlay/.test(await screen)) break;
        if (attempt === 120) throw new Error('the Java client did not finish loading in two minutes');
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return {
        lines,
        command,
        waitForLine,
        stop: async () => {
            child.stdin?.write('quit\n');
            const quit = setTimeout(() => {
                if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
            }, 15_000);
            await exited;
            clearTimeout(quit);
        }
    };
};
