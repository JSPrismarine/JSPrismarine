/**
 * `levels.json`: the levels created while the server ran, which the config never names
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)). The server owns
 * the file and rewrites it whenever a level is created, attached or detached.
 */
import type { MigrationLogger, FileMigrations } from '../config/FileMigrations';
import { migrateFile } from '../config/FileMigrations';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { WorldData } from '../config/JsonConfigTypes';
import { writeJsonFile } from '../config/JsonFile';
import { isRecord } from '../utils/isRecord';
import { isUuid } from '../utils/isUuid';

/** The file's name, beside `config.json` and `addons.json`. */
export const LEVELS_FILE_NAME = 'levels.json';

/** The layout this server writes. */
export const LEVELS_SCHEMA_VERSION = 1;

/** How `levels.json` upgrades. It has had one layout so far. */
export const LEVELS_MIGRATIONS: FileMigrations = {
    fileName: LEVELS_FILE_NAME,
    unversioned: LEVELS_SCHEMA_VERSION,
    current: LEVELS_SCHEMA_VERSION,
    steps: [],
    keyOrder: ['schemaVersion', 'levels']
};

/** Whether a registered level loads when the server starts. */
export type RegisteredLevelState = 'attached' | 'detached';

/** One level the registry records. */
export interface RegisteredLevel {
    /** The level's UUID, which its save holds too. */
    readonly id: string;
    /** The level's name. Attached levels have names of their own; detached ones may share one. */
    readonly name: string;
    /** Its folder under `worlds/`. */
    readonly folder: string;
    readonly state: RegisteredLevelState;
    /** What the level was created with, in the shape of a `worlds.<name>` entry. */
    readonly world: WorldData;
}

/** Reads one entry, or undefined for one that is not a level. */
const registeredLevelOf = (id: string, value: unknown): RegisteredLevel | undefined => {
    if (!isUuid(id) || !isRecord(value)) return undefined;
    const { name, folder, state, world } = value;
    if (typeof name !== 'string' || typeof folder !== 'string' || !isRecord(world)) return undefined;
    if (state !== 'attached' && state !== 'detached') return undefined;
    const { seed } = world;
    if (typeof seed !== 'string' && typeof seed !== 'number') return undefined;
    // Parsed JSON, as `config.json`'s `worlds` is: `normalizeWorldData` checks the rest of the
    // entry when the level loads.
    const entry: WorldData = { ...(world as Partial<WorldData>), seed };
    return { id: id.toLowerCase(), name, folder, state, world: entry };
};

/** The levels `levels.json` records, read from and written to one file. */
export class LevelRegistry {
    private readonly file: string;
    private readonly logger: MigrationLogger;
    private readonly levels = new Map<string, RegisteredLevel>();

    /**
     * @param file - The path of `levels.json`.
     * @param logger - Told when the file is upgraded.
     */
    public constructor(file: string, logger: MigrationLogger) {
        this.file = file;
        this.logger = logger;
    }

    /** Reads the file, upgrading an older layout. A missing file is an empty registry. */
    public async load(): Promise<void> {
        this.levels.clear();
        const migrated = await migrateFile(this.file, LEVELS_MIGRATIONS, this.logger);
        const root = migrated?.document.get(['levels']);
        if (!isRecord(root)) return;
        for (const [id, value] of Object.entries(root)) {
            const level = registeredLevelOf(id, value);
            if (level !== undefined) this.levels.set(level.id, level);
        }
    }

    /** Every registered level, in the order it was added. */
    public all(): RegisteredLevel[] {
        return [...this.levels.values()];
    }

    /** The level with a UUID, or undefined. */
    public get(id: string): RegisteredLevel | undefined {
        return this.levels.get(id.toLowerCase());
    }

    /** Records a level, or replaces its record, and writes the file. */
    public async put(level: RegisteredLevel): Promise<void> {
        this.levels.set(level.id, level);
        await this.write();
    }

    private async write(): Promise<void> {
        const document = parseConfigDocument('{}', LEVELS_MIGRATIONS.keyOrder);
        document.set(['schemaVersion'], LEVELS_SCHEMA_VERSION);
        document.set(
            ['levels'],
            Object.fromEntries(
                this.all().map(({ id, name, folder, state, world }) => [id, { name, folder, state, world }])
            )
        );
        await writeJsonFile(this.file, document);
    }
}
