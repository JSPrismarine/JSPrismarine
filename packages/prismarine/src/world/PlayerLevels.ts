/**
 * `player-levels.json`: the level each player was last in, when it is not the entry level, so a
 * player who logs out in another level comes back in it. Each level keeps the player's record
 * for itself; this file only says which level's record to read
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
 */
import { parseConfigDocument } from '../config/ConfigDocument';
import type { FileMigrations, MigrationLogger } from '../config/FileMigrations';
import { migrateFile } from '../config/FileMigrations';
import { writeJsonFile } from '../config/JsonFile';
import { isRecord } from '../utils/isRecord';
import { isUuid } from '../utils/isUuid';
import { SerialQueue } from '../utils/serialQueue';

/** The file's name, beside `levels.json`. */
export const PLAYER_LEVELS_FILE_NAME = 'player-levels.json';

/** How `player-levels.json` upgrades. It has had one layout so far. */
export const PLAYER_LEVELS_MIGRATIONS: FileMigrations = {
    fileName: PLAYER_LEVELS_FILE_NAME,
    unversioned: 1,
    current: 1,
    steps: [],
    keyOrder: ['schemaVersion', 'players']
};

/** The level each player was last in, by player key, for the players not in the entry level. */
export class PlayerLevels {
    private readonly file: string;
    private readonly logger: MigrationLogger;
    private readonly levels = new Map<string, string>();
    /** The writes, one at a time, so the file ends up with the last one. */
    private readonly writes = new SerialQueue();

    public constructor(file: string, logger: MigrationLogger) {
        this.file = file;
        this.logger = logger;
    }

    /** Reads the file. A missing file says every player is in the entry level. */
    public async load(): Promise<void> {
        this.levels.clear();
        const players = (await migrateFile(this.file, PLAYER_LEVELS_MIGRATIONS, this.logger))?.document.get([
            'players'
        ]);
        if (!isRecord(players)) return;
        for (const [key, level] of Object.entries(players)) {
            if (isUuid(level)) this.levels.set(key, level.toLowerCase());
        }
    }

    /** The UUID of the level a player was last in, or undefined for the entry level. */
    public levelOf(playerKey: string): string | undefined {
        return this.levels.get(playerKey);
    }

    /**
     * Records the level a player is in now, and writes the file.
     * @param level - The level's UUID, or undefined for the entry level.
     */
    public set(playerKey: string, level: string | undefined): Promise<void> {
        if (this.levels.get(playerKey) === level) return Promise.resolve();
        if (level === undefined) this.levels.delete(playerKey);
        else this.levels.set(playerKey, level);
        return this.writes.run(async () => {
            const document = parseConfigDocument('{}', PLAYER_LEVELS_MIGRATIONS.keyOrder);
            document.set(['schemaVersion'], PLAYER_LEVELS_MIGRATIONS.current);
            document.set(['players'], Object.fromEntries(this.levels));
            await writeJsonFile(this.file, document);
        });
    }
}
