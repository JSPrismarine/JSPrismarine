/**
 * Runs the repository's addons under the Minecraft Bedrock Debugger from VS Code.
 *
 * `.vscode/launch.json` has one "Debug addon scripts" configuration per addon with a script module,
 * which this script writes from the addons' manifests. Each one listens on the debugger port with
 * `localRoot` and `targetModuleUuid` set to its addon, and starts the "Dev server with script
 * debugging" task first. VS Code cannot hand a launch configuration's input to its pre-launch task
 * (microsoft/vscode#27157), so the configuration picked is the only choice: the task links every
 * addon and the extension asks the server for the one its configuration names.
 *
 * - With no flag, as the task runs it, it prepares the data folder that `JSP_DIR` names. It writes
 *   `config.json` when the folder has none: a flat world, and `script-debugger-auto-attach` in
 *   connect mode to the debugger port. A config.json that exists is left alone, so edits to it
 *   stay. It writes `addons.json` every time, linking each addon, so an addon added since the last
 *   run is there too. The folder is separate from the `jsp/` folder `pnpm dev` uses, so debugging
 *   leaves that server's settings, addons and worlds as they were.
 * - `--update` writes the configurations into `.vscode/launch.json`, keeping any others.
 * - `--check` fails when `.vscode/launch.json` lacks a configuration, or holds a stale one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { isRecord } from './isRecord.mts';

const REPOSITORY = path.resolve(import.meta.dirname, '..');

/** The repository's addons, one folder each. */
const ADDONS = path.join(REPOSITORY, 'addons');

const LAUNCH_FILE = path.join(REPOSITORY, '.vscode', 'launch.json');

/** The label of the task in `.vscode/tasks.json` that runs this script and `pnpm dev`. */
const TASK_LABEL = 'Dev server with script debugging';

/** The port the extension listens on: its own default, and Bedrock Dedicated Server's. */
const DEBUGGER_PORT = 19144;

/**
 * How long the server waits for the extension before the addons' scripts start, in seconds. The
 * extension starts listening while the dev build runs, so it is ready well before this runs out,
 * and a breakpoint on a script's first lines stops.
 */
const ATTACH_TIMEOUT_SECONDS = 30;

/** An addon the debugger can attach to. */
interface ScriptAddon {
    /** Its folder under `addons/`. */
    readonly folder: string;
    /** The name in its manifest's header. */
    readonly name: string;
    /** The UUID of its script module. */
    readonly moduleUuid: string;
}

// A declaration rather than an arrow, so a call narrows what follows it.
function fail(message: string): never {
    process.stderr.write(`script-debug-server: ${message}\n`);
    process.exit(1);
}

/** The addons under `addons/` whose manifest has a script module, by folder name. */
const scriptAddons = (): ScriptAddon[] =>
    fs
        .readdirSync(ADDONS, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ADDONS, entry.name, 'manifest.json')))
        .map((entry) => entry.name)
        .sort()
        .flatMap((folder) => {
            // Parsed JSON: the checks below narrow it.
            const manifest: unknown = JSON.parse(fs.readFileSync(path.join(ADDONS, folder, 'manifest.json'), 'utf8'));
            if (!isRecord(manifest) || !isRecord(manifest.header) || !Array.isArray(manifest.modules)) return [];
            const module = manifest.modules.find((entry) => isRecord(entry) && entry.type === 'script');
            if (!isRecord(module) || typeof module.uuid !== 'string') return [];
            const name = typeof manifest.header.name === 'string' ? manifest.header.name : folder;
            return [{ folder, name, moduleUuid: module.uuid }];
        });

/** The launch configuration that debugs one addon. */
const launchConfiguration = (addon: ScriptAddon): Record<string, unknown> => ({
    name: `Debug addon scripts: ${addon.name}`,
    type: 'minecraft-js',
    request: 'attach',
    mode: 'listen',
    port: DEBUGGER_PORT,
    localRoot: `\${workspaceFolder}/addons/${addon.folder}/scripts`,
    targetModuleUuid: addon.moduleUuid,
    preLaunchTask: TASK_LABEL
});

/** Whether a configuration is one this script writes. */
const isGenerated = (configuration: unknown): boolean =>
    isRecord(configuration) && configuration.preLaunchTask === TASK_LABEL;

const readLaunchFile = (): Record<string, unknown> => {
    // Parsed JSON: the check below narrows it.
    const launch: unknown = JSON.parse(fs.readFileSync(LAUNCH_FILE, 'utf8'));
    if (!isRecord(launch) || !Array.isArray(launch.configurations)) {
        fail(`${path.relative(REPOSITORY, LAUNCH_FILE)} has no configurations list`);
    }
    return launch;
};

/** The file's configurations with this script's replaced by the current ones. */
const updatedConfigurations = (current: readonly unknown[]): unknown[] => [
    ...scriptAddons().map(launchConfiguration),
    ...current.filter((configuration) => !isGenerated(configuration))
];

const check = (): void => {
    const current = readLaunchFile().configurations;
    if (!Array.isArray(current) || !isDeepStrictEqual(current, updatedConfigurations(current))) {
        fail(
            `${path.relative(REPOSITORY, LAUNCH_FILE)} does not match the addons; run node scripts/script-debug-server.mts --update`
        );
    }
    process.stdout.write('Every addon with scripts has a launch configuration.\n');
};

const update = (): void => {
    const launch = readLaunchFile();
    const current = Array.isArray(launch.configurations) ? launch.configurations : [];
    const next = { ...launch, configurations: updatedConfigurations(current) };
    fs.writeFileSync(LAUNCH_FILE, `${JSON.stringify(next, null, 4)}\n`);
};

const prepare = (): void => {
    const dataDirectory = process.env.JSP_DIR;
    if (!dataDirectory) fail('set JSP_DIR to the data folder to prepare');

    const root = path.resolve(dataDirectory);
    fs.mkdirSync(root, { recursive: true });

    const configFile = path.join(root, 'config.json');
    if (!fs.existsSync(configFile)) {
        const config = {
            'level-name': 'world',
            worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB' } },
            'allow-outbound-script-debugging': true,
            'script-debugger-auto-attach': 'connect',
            'script-debugger-auto-attach-connect-address': `localhost:${DEBUGGER_PORT}`,
            'script-debugger-auto-attach-timeout': ATTACH_TIMEOUT_SECONDS
        };
        fs.writeFileSync(configFile, `${JSON.stringify(config, null, 4)}\n`);
    }

    const addons = scriptAddons();
    const requests = Object.fromEntries(
        addons.map(({ folder }) => {
            const relative = path.relative(root, path.join(ADDONS, folder)).split(path.sep).join('/');
            return [folder, { path: relative.startsWith('.') ? relative : `./${relative}` }];
        })
    );
    fs.writeFileSync(path.join(root, 'addons.json'), `${JSON.stringify({ addons: requests }, null, 4)}\n`);

    // `.vscode/tasks.json` starts the debugger once it reads this line.
    process.stdout.write(`Debugging the scripts of ${addons.map(({ folder }) => folder).join(', ')} in ${root}\n`);
};

if (import.meta.main) {
    if (process.argv.includes('--check')) check();
    else if (process.argv.includes('--update')) update();
    else prepare();
}
