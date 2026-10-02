/**
 * A database we could not fully parse. Always fatal: there is no repair path here, and guessing
 * at a half-understood database is how a world gets silently mangled. Open it in the game, which
 * has one, and let it rewrite the files.
 */
export class CorruptionError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'CorruptionError';
    }
}

/**
 * The database directory is held by someone else - another server, or the game itself.
 *
 * A lock left behind by a process that is no longer running is not this: it is taken over
 * silently, so a server killed without a chance to clean up still starts next time.
 */
export class DatabaseLockedError extends Error {
    public constructor(path: string, cause?: unknown, pid?: number) {
        const owner = pid === undefined ? '' : ` (held by process ${pid}, which is still running)`;

        super(
            `The world at ${path} is already open${owner}. Close Minecraft, or the other server, ` +
                `before starting: two writers on one LevelDB do not race for a stale read, they ` +
                `delete each other's files and the world does not survive it.`
        );
        this.name = 'DatabaseLockedError';
        this.cause = cause;
    }
}

/** A world written before the chunk formats this package understands. */
export class UnsupportedVersionError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'UnsupportedVersionError';
    }
}
