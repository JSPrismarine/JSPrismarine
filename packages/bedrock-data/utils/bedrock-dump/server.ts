/**
 * Stages and drives a Bedrock Dedicated Server.
 *
 * The binary is a 244 MB proprietary ELF executable for Linux x86-64 that resolves every path it
 * reads against its working directory, so it cannot be run from the extracted archive without
 * writing into it. This module copies the archive into a run directory of its own once, leaves
 * the archive untouched, and starts the copy from outside. The extracted tree stays read-only
 * data, which is what the repository's rule about untrusted downloads asks for.
 *
 * Two details are easy to lose and cost a whole run each. `extractZip` writes every entry as a
 * plain file, so the staged binary has no execute bit until this module sets one. And the engine
 * discards script output unless `content-log-console-output-enabled` is true, which is the only
 * channel the dump pack has.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

/** File name of the server executable inside the archive. */
export const SERVER_BINARY = 'bedrock_server';

/** Line the engine prints once it is accepting commands and connections. */
export const READY_LINE = 'Server started';

/** Names in the archive the run directory does not take a copy of. */
const NOT_STAGED = new Set(['worlds', '.jsp-fetch.json']);

const STAGE_MARKER = '.jsp-staged.json';

/** Directory in a run directory holding one empty file per process using it, named by its id. */
const USERS_DIRECTORY = '.jsp-in-use';

/**
 * What a staged copy was made from, as the staging marker records it.
 *
 * The archive's real path, not the path it was reached by: linked worktrees reach the shared cache
 * through a link of their own (`scripts/share-worktree-cache.ts`), and a path that names the
 * worktree would make each worktree take the other's copy for stale. The binary's size and
 * modification time tell a re-extracted or replaced archive from the one the copy was made from.
 */
const stagingIdentity = async (unpacked: string): Promise<string> => {
    const binary = await stat(join(unpacked, SERVER_BINARY)).catch(() => undefined);
    return JSON.stringify({
        unpacked: await realpath(unpacked),
        binary: binary === undefined ? null : { size: binary.size, modified: binary.mtimeMs }
    });
};

/** Whether a process with this id is running. */
const isRunning = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error: unknown) {
        // EPERM: the process exists but belongs to someone else.
        return error instanceof Error && 'code' in error && error.code === 'EPERM';
    }
};

/** The other running processes that staged a server in `root`. Entries of exited ones are skipped. */
const otherUsers = async (root: string): Promise<number[]> => {
    const entries = await readdir(join(root, USERS_DIRECTORY)).catch((): string[] => []);
    return entries.map(Number).filter((pid) => Number.isInteger(pid) && pid !== process.pid && isRunning(pid));
};

/** Run directories this process registered in, removed from their user lists when it exits. */
const registered = new Set<string>();

/** Records this process as a user of `root` until it exits. */
const registerUser = async (root: string): Promise<void> => {
    await mkdir(join(root, USERS_DIRECTORY), { recursive: true });
    await writeFile(join(root, USERS_DIRECTORY, String(process.pid)), '');
    if (registered.size === 0) {
        process.once('exit', () => {
            for (const directory of registered)
                rmSync(join(directory, USERS_DIRECTORY, String(process.pid)), { force: true });
        });
    }
    registered.add(root);
};

/**
 * Properties every pass overrides, whatever else it sets.
 *
 * `content-log-console-output-enabled` is the dump pack's only way out. The log file is enabled
 * as well because it survives a crash that takes stdout with it. An offline identity needs the
 * allow list and online mode off. The transport is chosen per server; see {@link transportProperties}.
 */
export const COMMON_PROPERTIES: Readonly<Record<string, string>> = {
    'content-log-console-output-enabled': 'true',
    'content-log-file-enabled': 'true',
    'content-log-level': 'info',
    'online-mode': 'false',
    'allow-list': 'false',
    'allow-cheats': 'true',
    'player-idle-timeout': '0'
};

/** The transport a staged server accepts clients over. */
export type ServerTransport = 'raknet' | 'nethernet';

/**
 * The transport a server is staged with, and the properties that select it.
 *
 * NetherNet became the default in 1.26.50, and a shipped `server.properties` with a `transport`
 * key can still be switched to RakNet, which the capture has used since. A server without the key
 * speaks NetherNet only (1.26.70 removed it). Its WebRTC candidates then have to name an address
 * the client reaches, which inside a container is not the container's own, so the server
 * advertises the loopback address the published ports listen on.
 * @param shipped - The `server.properties` text the archive ships.
 */
export const transportProperties = (
    shipped: string
): { transport: ServerTransport; properties: Record<string, string> } =>
    /^transport=/m.test(shipped)
        ? { transport: 'raknet', properties: { transport: 'raknet' } }
        : { transport: 'nethernet', properties: { 'server-public-ip': '127.0.0.1' } };

/**
 * Rewrites a `server.properties` file.
 *
 * Keys already in the file keep their position so that a diff against the shipped file shows
 * only what the job changed; keys the file does not have are appended.
 */
export const renderServerProperties = (shipped: string, overrides: Record<string, string>): string => {
    const remaining = new Map(Object.entries(overrides));
    const lines = shipped.split('\n').map((line) => {
        const separator = line.indexOf('=');
        if (line.startsWith('#') || separator < 0) return line;
        const key = line.slice(0, separator).trim();
        if (!remaining.has(key)) return line;
        const value = remaining.get(key)!;
        remaining.delete(key);
        return `${key}=${value}`;
    });
    for (const [key, value] of remaining) lines.push(`${key}=${value}`);
    return `${lines.join('\n').replace(/\n+$/, '')}\n`;
};

/** A staged server: a run directory holding a copy of the archive and a world of its own. */
export interface StagedServer {
    /** The run directory, which is the server's working directory. */
    root: string;
    /** The executable inside the run directory. */
    binary: string;
    /** The world directory the staged `level-name` resolves to. */
    worldDirectory: string;
    /** The level name written into `server.properties`. */
    levelName: string;
    /** The transport a client dials it over. */
    transport: ServerTransport;
}

/** What {@link stageServer} needs to know. */
export interface StageOptions {
    /** The extracted Bedrock Dedicated Server archive. Read, never written. */
    unpacked: string;
    /** Directory the copy is made in. Created if it does not exist. */
    root: string;
    /**
     * `server.properties` values on top of {@link COMMON_PROPERTIES}. The archive decides the
     * transport, so a `transport` key here is refused.
     */
    properties?: Record<string, string>;
    /** Level name, and so the world directory. Defaults to `jsp-capture`. */
    levelName?: string;
    /** Copy the archive again even when the run directory already holds one. */
    force?: boolean;
}

/**
 * Copies the archive into a run directory, makes the binary executable and writes the
 * properties for this pass.
 *
 * The copy is skipped when the run directory already holds one made from the same archive,
 * because it is 315 MB, whichever worktree made it. The world directory is always recreated, so
 * each pass starts from a freshly generated world.
 *
 * @throws Error when another running process staged a server in the same run directory. Its
 *   capture may still be running there, and restaging would delete its server or its world.
 */
export const stageServer = async (options: StageOptions): Promise<StagedServer> => {
    // StagedServer.transport tells the client how to dial, so an override would leave it wrong.
    if (options.properties?.transport !== undefined) {
        throw new Error('stageServer chooses the transport from the archive; drop the transport property');
    }
    const levelName = options.levelName ?? 'jsp-capture';
    const root = options.root;
    const marker = join(root, STAGE_MARKER);

    // Every pass deletes the world, and a stale copy is deleted whole, so a run directory another
    // running process staged is left alone: wiping it would break the capture running there.
    const users = await otherUsers(root);
    if (users.length > 0) {
        throw new Error(
            `${root} is in use by process ${users.join(', ')}; wait for it to finish, or stage in another run directory`
        );
    }

    const identity = await stagingIdentity(options.unpacked);
    const staged = await readFile(marker, 'utf8').catch(() => '');
    if (options.force === true || staged.trim() !== identity) {
        await rm(root, { recursive: true, force: true });
        await mkdir(root, { recursive: true });
        for (const entry of await readdir(options.unpacked)) {
            if (NOT_STAGED.has(entry)) continue;
            await cp(join(options.unpacked, entry), join(root, entry), { recursive: true });
        }
        await writeFile(marker, `${identity}\n`);
    }
    await registerUser(root);

    const binary = join(root, SERVER_BINARY);
    // The zip reader writes plain files, so the copy arrives without an execute bit.
    await chmod(binary, 0o755);

    const worldDirectory = join(root, 'worlds', levelName);
    await rm(worldDirectory, { recursive: true, force: true });
    await mkdir(worldDirectory, { recursive: true });

    const shipped = await readFile(join(options.unpacked, 'server.properties'), 'utf8');
    const { transport, properties } = transportProperties(shipped);
    await writeFile(
        join(root, 'server.properties'),
        renderServerProperties(shipped, {
            ...COMMON_PROPERTIES,
            ...properties,
            ...options.properties,
            'level-name': levelName
        })
    );

    return { root, binary, worldDirectory, levelName, transport };
};

/** A running server, and the three things a capture pass does with one. */
export interface RunningServer {
    /** Every line the server has written so far, stdout and stderr merged in arrival order. */
    readonly lines: readonly string[];
    /**
     * Resolves with the first line, past or future, the predicate accepts.
     *
     * @param fromIndex - Index into {@link RunningServer.lines} to start matching past lines
     * from. A caller that sends a command the server answers more than once per run passes the
     * length of `lines` at send time, so an earlier answer is not mistaken for this one.
     * @throws Error when the server exits or the timeout passes first.
     */
    waitForLine(
        matches: (line: string) => boolean,
        what: string,
        timeoutMs: number,
        fromIndex?: number
    ): Promise<string>;
    /** Writes one console command, as a terminal would. */
    send(command: string): void;
    /**
     * Sends `stop` and waits for the process to exit.
     *
     * A killed server never writes its world, so every pass that cares about the save ends here.
     *
     * @returns The exit status, or null when a signal ended the process.
     */
    stop(timeoutMs: number): Promise<number | null>;
}

/** What {@link startServer} runs. Tests point it at a stand-in for the real binary. */
export interface StartOptions {
    /** Executable to run. */
    command: string;
    /** Arguments, usually none. */
    args?: readonly string[];
    /** Working directory, which the server resolves its packs and worlds against. */
    cwd: string;
    /** Extra environment on top of the current process's. */
    env?: Record<string, string>;
    /** Called with every line as it arrives, for progress output. */
    onLine?: (line: string) => void;
}

interface Waiter {
    matches: (line: string) => boolean;
    resolve: (line: string) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * Starts a server and returns a handle on its console.
 *
 * The handle reads stdout and stderr as one stream of lines, because the engine splits its
 * output between them in ways that are not worth depending on.
 */
export const startServer = (options: StartOptions): RunningServer => {
    const child: ChildProcessWithoutNullStreams = spawn(options.command, [...(options.args ?? [])], {
        cwd: options.cwd,
        // The server loads its own shared objects from the directory it was unpacked into.
        env: { ...process.env, LD_LIBRARY_PATH: '.', ...options.env },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const lines: string[] = [];
    const waiters = new Set<Waiter>();
    let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;

    const offer = (line: string): void => {
        lines.push(line);
        options.onLine?.(line);
        for (const waiter of [...waiters]) {
            if (!waiter.matches(line)) continue;
            clearTimeout(waiter.timer);
            waiters.delete(waiter);
            waiter.resolve(line);
        }
    };

    for (const stream of [child.stdout, child.stderr]) {
        createInterface({ input: stream, crlfDelay: Infinity }).on('line', offer);
    }

    const exited = new Promise<number | null>((resolve) => {
        child.on('exit', (code, signal) => {
            exit = { code, signal };
            for (const waiter of [...waiters]) {
                clearTimeout(waiter.timer);
                waiters.delete(waiter);
                waiter.reject(new Error(`The server exited (status ${code ?? signal}) before the expected output.`));
            }
            resolve(code);
        });
    });

    return {
        lines,
        waitForLine: (matches, what, timeoutMs, fromIndex = 0) =>
            new Promise<string>((resolve, reject) => {
                const already = lines.slice(fromIndex).find(matches);
                if (already !== undefined) {
                    resolve(already);
                    return;
                }
                if (exit !== undefined) {
                    reject(new Error(`The server has already exited; it never printed ${what}.`));
                    return;
                }
                const waiter: Waiter = {
                    matches,
                    resolve,
                    reject,
                    timer: setTimeout(() => {
                        waiters.delete(waiter);
                        reject(new Error(`Waited ${timeoutMs} ms for ${what} and the server never printed it.`));
                    }, timeoutMs)
                };
                waiters.add(waiter);
            }),
        send: (command) => {
            child.stdin.write(`${command}\n`);
        },
        stop: async (timeoutMs) => {
            if (exit !== undefined) return exit.code;
            child.stdin.write('stop\n');
            const killer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
            try {
                return await exited;
            } finally {
                clearTimeout(killer);
            }
        }
    };
};
