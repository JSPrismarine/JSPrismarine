/**
 * Evaluates Node's on-disk module compile cache against both server entry paths.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:compile-cache`. The server uses a
 * temporary flat world and preload radius zero, so this measures startup without requiring
 * Java world-generation data or changing a real server directory.
 */
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
    accessSync,
    constants,
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';

interface StartupMeasurement {
    readonly type: 'startup-measurement';
    readonly timeToListenMs: number;
    readonly mainThreadCpuUs: NodeJS.CpuUsage;
    readonly heapUsedBytes: number;
    readonly workerStarts: number;
    readonly firstWorkerStartMs?: number;
}

interface StartupRun extends StartupMeasurement {
    readonly runtime: 'tsx' | 'built';
    readonly cache: 'disabled' | 'cold' | 'warm';
    readonly cacheSizeBytes: number;
}

interface WorkerSmokeResult {
    readonly status: 'passed' | 'failed' | 'timeout';
    readonly elapsedMs: number;
    readonly detail: string;
}

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const serverRoot = join(repositoryRoot, 'packages/server');
const serverSource = join(serverRoot, 'src/Server.ts');
const serverBuilt = join(serverRoot, 'dist/Server.es.js');
const workerSmokeEntry = fileURLToPath(new URL('./compileCacheWorker.ts', import.meta.url));
const probe = fileURLToPath(new URL('./compileCacheProbe.mjs', import.meta.url));
const STARTUP_TIMEOUT_MS = 180_000;
const args = process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);
const runsPerCase = Number.parseInt(args[0] ?? '3', 10);
if (!Number.isSafeInteger(runsPerCase) || runsPerCase < 1) throw new RangeError('Run count must be a positive integer');

const buildSkipped = process.env.JSP_BENCH_SKIP_BUILD === '1';
if (!buildSkipped || !existsSync(serverBuilt)) {
    const built = spawnSync('pnpm', ['--filter', '@jsprismarine/server...', 'run', 'build'], {
        cwd: repositoryRoot,
        stdio: 'inherit'
    });
    if (built.status !== 0) throw new Error('Could not build @jsprismarine/server and its dependencies.');
}

const root = join(tmpdir(), `jsprismarine-compile-cache-${process.pid}-${Date.now()}`);
const serverData = join(root, 'server');
const cacheRoot = join(serverData, 'compile-cache');
const consumerRoot = join(root, 'consumer');
mkdirSync(serverData, { recursive: true });
mkdirSync(cacheRoot, { recursive: true });
accessSync(cacheRoot, constants.R_OK | constants.W_OK);

interface PackageManifest {
    readonly name?: string;
    readonly exports?: unknown;
    readonly publishConfig?: { readonly exports?: unknown };
    readonly [key: string]: unknown;
}

const consumerPackages = new Map<string, string>();
const packageDirectories = globSync('packages/**/package.json', {
    cwd: repositoryRoot,
    ignore: ['**/node_modules/**', '**/dist/**']
});
for (const manifestPath of packageDirectories) {
    // Repository package manifests are the trusted source of the consumer view's package names and exports.
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, manifestPath), 'utf8')) as PackageManifest;
    if (manifest.name === undefined) continue;
    const sourcePackage = dirname(join(repositoryRoot, manifestPath));
    const consumerPackage = join(consumerRoot, relative(repositoryRoot, sourcePackage));
    consumerPackages.set(manifest.name, consumerPackage);
    mkdirSync(consumerPackage, { recursive: true });

    for (const entry of readdirSync(sourcePackage, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'package.json') continue;
        symlinkSync(join(sourcePackage, entry.name), join(consumerPackage, entry.name));
    }
    if (existsSync(join(sourcePackage, 'dist'))) {
        cpSync(join(sourcePackage, 'dist'), join(consumerPackage, 'dist'), { recursive: true });
    }
    writeFileSync(
        join(consumerPackage, 'package.json'),
        `${JSON.stringify({ ...manifest, exports: manifest.publishConfig?.exports ?? manifest.exports }, null, 2)}\n`
    );
}

for (const manifestPath of packageDirectories) {
    const sourcePackage = dirname(join(repositoryRoot, manifestPath));
    const consumerPackage = consumerPackages.get(
        (JSON.parse(readFileSync(join(repositoryRoot, manifestPath), 'utf8')) as PackageManifest).name ?? ''
    );
    if (consumerPackage === undefined) continue;

    const sourceModules = join(sourcePackage, 'node_modules');
    if (!existsSync(sourceModules)) continue;
    const consumerModules = join(consumerPackage, 'node_modules');
    mkdirSync(consumerModules, { recursive: true });
    for (const entry of readdirSync(sourceModules, { withFileTypes: true })) {
        if (entry.name === '.bin' || entry.name === '.pnpm') continue;
        const sourceEntry = join(sourceModules, entry.name);
        const destinationEntry = join(consumerModules, entry.name);
        if (entry.name.startsWith('@') && (entry.isDirectory() || entry.isSymbolicLink())) {
            mkdirSync(destinationEntry, { recursive: true });
            const sourceScope = realpathSync(sourceEntry);
            for (const scopedPackage of readdirSync(sourceScope, { withFileTypes: true })) {
                const sourceScopedPackage = join(sourceScope, scopedPackage.name);
                const packageName = `${entry.name}/${scopedPackage.name}`;
                const consumerScopedPackage = consumerPackages.get(packageName);
                symlinkSync(
                    consumerScopedPackage ?? realpathSync(sourceScopedPackage),
                    join(destinationEntry, scopedPackage.name)
                );
            }
        } else {
            const consumerDependency = consumerPackages.get(entry.name);
            symlinkSync(consumerDependency ?? realpathSync(sourceEntry), destinationEntry);
        }
    }
}

const builtServerRoot = consumerPackages.get('@jsprismarine/server');
if (builtServerRoot === undefined || !existsSync(join(builtServerRoot, 'dist/Server.es.js'))) {
    throw new Error('The built server consumer view is missing dist/Server.es.js.');
}
const builtServerEntry = join(builtServerRoot, 'dist/Server.es.js');

const config = {
    'preload-radius': 0,
    'chunk-workers': 0,
    'server-ip': '127.0.0.1',
    worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '2831' } }
};
writeFileSync(join(serverData, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
const workloadDigest = createHash('sha256').update(JSON.stringify(config)).digest('hex');

/** Whether an IPC message is the startup measurement sent by the preload probe. */
const isStartupMeasurement = (value: unknown): value is StartupMeasurement => {
    if (typeof value !== 'object' || value === null) return false;
    if (
        !('type' in value) ||
        !('timeToListenMs' in value) ||
        !('mainThreadCpuUs' in value) ||
        !('heapUsedBytes' in value) ||
        !('workerStarts' in value)
    ) {
        return false;
    }

    return (
        value.type === 'startup-measurement' &&
        typeof value.timeToListenMs === 'number' &&
        typeof value.mainThreadCpuUs === 'object' &&
        value.mainThreadCpuUs !== null &&
        'user' in value.mainThreadCpuUs &&
        typeof value.mainThreadCpuUs.user === 'number' &&
        'system' in value.mainThreadCpuUs &&
        typeof value.mainThreadCpuUs.system === 'number' &&
        typeof value.heapUsedBytes === 'number' &&
        typeof value.workerStarts === 'number'
    );
};

/** Returns the total bytes held below a cache directory. */
const directoryBytes = (path: string): number => {
    let bytes = 0;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        const entryPath = join(path, entry.name);
        bytes += entry.isDirectory() ? directoryBytes(entryPath) : statSync(entryPath).size;
    }
    return bytes;
};

const freeUdpPort = async (): Promise<number> => {
    const { createSocket } = await import('node:dgram');
    const socket = createSocket('udp4');
    await new Promise<void>((resolvePromise, reject) => {
        socket.once('error', reject);
        socket.bind(0, '127.0.0.1', () => resolvePromise());
    });
    const address = socket.address();
    socket.close();
    return address.port;
};

const runServer = async (
    runtime: StartupRun['runtime'],
    cache: StartupRun['cache'],
    compileCache: string | undefined
): Promise<StartupRun> => {
    const port = await freeUdpPort();
    const execArgv = runtime === 'tsx' ? ['--import', 'tsx', '--import', probe] : ['--import', probe];
    const entry = runtime === 'tsx' ? serverSource : builtServerEntry;
    const cwd = runtime === 'tsx' ? serverRoot : builtServerRoot;
    const env = { ...process.env, JSP_DIR: serverData, JSP_NO_TUI: '1', CI: '1' };
    if (compileCache === undefined) delete env.NODE_COMPILE_CACHE;
    else env.NODE_COMPILE_CACHE = compileCache;

    const child = spawn(process.execPath, [...execArgv, entry, '--no-tui', '--port', String(port)], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let stderrBuffer = '';
    let measurement: StartupMeasurement | undefined;
    let resolveMeasurement: ((measurement: StartupMeasurement) => void) | undefined;
    let rejectMeasurement: ((error: Error) => void) | undefined;
    const measured = new Promise<StartupMeasurement>((resolvePromise, reject) => {
        resolveMeasurement = resolvePromise;
        rejectMeasurement = reject;
    });
    const timeout = setTimeout(
        () =>
            rejectMeasurement?.(
                new Error(`Server did not listen within ${STARTUP_TIMEOUT_MS / 1000} seconds:\n${output}`)
            ),
        STARTUP_TIMEOUT_MS
    );

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
        output += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
        output += chunk;
        stderrBuffer += chunk;
        for (;;) {
            const newline = stderrBuffer.indexOf('\n');
            if (newline < 0) break;
            const line = stderrBuffer.slice(0, newline);
            stderrBuffer = stderrBuffer.slice(newline + 1);
            const prefix = '__JSP_STARTUP_METRIC__';
            if (!line.startsWith(prefix)) continue;
            let message: unknown;
            try {
                message = JSON.parse(line.slice(prefix.length));
            } catch {
                continue;
            }
            if (isStartupMeasurement(message)) {
                measurement = message;
                clearTimeout(timeout);
                resolveMeasurement?.(message);
            }
        }
    });
    child.once('error', (error) => {
        clearTimeout(timeout);
        rejectMeasurement?.(error);
    });
    child.once('exit', (code, signal) => {
        if (measurement === undefined) {
            clearTimeout(timeout);
            rejectMeasurement?.(
                new Error(
                    `Server exited before listening (${signal ?? code}): ${JSON.stringify(child.spawnargs)}\n${output}`
                )
            );
        }
    });

    try {
        const result = await measured;
        child.kill('SIGTERM');
        await new Promise<void>((resolvePromise) => {
            if (child.exitCode !== null || child.signalCode !== null) resolvePromise();
            else child.once('exit', () => resolvePromise());
        });
        return {
            ...result,
            runtime,
            cache,
            cacheSizeBytes: compileCache === undefined ? 0 : directoryBytes(compileCache)
        };
    } catch (error) {
        child.kill('SIGKILL');
        await new Promise<void>((resolvePromise) => {
            if (child.exitCode !== null || child.signalCode !== null) resolvePromise();
            else child.once('exit', () => resolvePromise());
        });
        throw error;
    }
};

/** Exercises a real TSX-loaded worker with both Node's CPU profiler and compile cache enabled. */
const runWorkerSmoke = async (compileCache: string, cpuProfileDir: string): Promise<WorkerSmokeResult> => {
    const startedAt = performance.now();
    const child = spawn(
        process.execPath,
        ['--cpu-prof', `--cpu-prof-dir=${cpuProfileDir}`, '--import', 'tsx', workerSmokeEntry],
        {
            cwd: join(repositoryRoot, 'packages/prismarine'),
            env: { ...process.env, NODE_COMPILE_CACHE: compileCache },
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );
    let output = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => (output += chunk));
    child.stderr?.on('data', (chunk: string) => (output += chunk));

    let timeout: NodeJS.Timeout | undefined;
    const exited = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>(
        (resolvePromise) => {
            child.once('exit', (code, signal) => resolvePromise({ code, signal }));
        }
    );
    const result = await Promise.race([
        exited,
        new Promise<'timeout'>((resolvePromise) => {
            timeout = setTimeout(() => resolvePromise('timeout'), 60_000);
        })
    ]);
    clearTimeout(timeout);
    if (result === 'timeout') {
        child.kill('SIGKILL');
        await exited;
        return { status: 'timeout', elapsedMs: performance.now() - startedAt, detail: output.trim() };
    }
    return {
        status: result.code === 0 ? 'passed' : 'failed',
        elapsedMs: performance.now() - startedAt,
        detail: output.trim() || `worker smoke exited with ${result.signal ?? result.code}`
    };
};

const results: StartupRun[] = [];
const workerSmokes: WorkerSmokeResult[] = [];
try {
    for (const runtime of ['tsx', 'built'] as const) {
        const runtimeCache = join(cacheRoot, runtime);
        for (const cache of ['disabled', 'cold', 'warm'] as const) {
            for (let run = 0; run < runsPerCase; run++) {
                const path = cache === 'disabled' ? undefined : runtimeCache;
                if (cache === 'cold') rmSync(runtimeCache, { recursive: true, force: true });
                if (path !== undefined) mkdirSync(path, { recursive: true });
                results.push(await runServer(runtime, cache, path));
            }
        }
    }
    const cpuProfileDir = join(root, 'cpu-profiles');
    mkdirSync(cpuProfileDir, { recursive: true });
    const workerCache = join(cacheRoot, 'tsx');
    for (let attempt = 0; attempt < 2; attempt++) {
        const smoke = await runWorkerSmoke(workerCache, cpuProfileDir);
        workerSmokes.push(smoke);
        if (smoke.status !== 'passed') break;
    }

    process.stdout.write(
        `${JSON.stringify({
            benchmark: 'compile-cache-startup',
            node: process.version,
            platform: `${process.platform}-${process.arch}`,
            workloadDigest,
            runsPerCase,
            results,
            cpuProfilePlusTsxWorkerSmokes: workerSmokes,
            cacheDirectoryWritable: true,
            cacheDirectorySizeBytes: directoryBytes(cacheRoot),
            cacheRemovedWithoutRemovingServerData: (() => {
                rmSync(cacheRoot, { recursive: true, force: true });
                return !existsSync(cacheRoot) && existsSync(join(serverData, 'config.json'));
            })()
        })}\n`
    );
} finally {
    rmSync(root, { recursive: true, force: true });
}
