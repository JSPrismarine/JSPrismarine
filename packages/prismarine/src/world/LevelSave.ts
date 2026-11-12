import type { Logger } from '@jsprismarine/logger';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import type BaseProvider from './providers/BaseProvider';
import type { LevelDatInputs } from './providers/Provider';
import type { ProviderSavePass, SavePassStats } from './providers/SavePass';
import type { WorldPersistenceData } from './WorldPersistence';

/** Two minutes at the server's twenty ticks per second. */
export const AUTO_SAVE_INTERVAL_TICKS = 20 * 120;

/**
 * Sub chunks an autosave encodes each tick after its cut.
 *
 * Eight fresh chunks' worth of terrain sections, which is what the pass wrote between event-loop
 * turns before it cut at a tick boundary: 441 fresh chunks take 56 ticks.
 */
export const SAVE_ENCODE_BUDGET = 64;

/**
 * Bytes of writes made outside a pass that a level holds before it commits them early, in a
 * pass with no cut of its own.
 *
 * The database's default write buffer, 4 MiB: about 190 chunks at the 22,327 bytes a changed
 * chunk encodes to on average (`docs/research/save-pass-measurement.md`), or nine chunk borders
 * a player crosses at the default view distance. An early commit then fills at most one
 * memtable, and the held writes stay under the 10 MB a pass may hold (ADR 0018), so a pass cut
 * just before the limit holds no more than about 14 MB.
 */
export const HELD_WRITE_LIMIT = 4 * 1024 * 1024;

/** What a pass reads from one world at its cut; see `World.cutSave`. */
export interface SavedWorld {
    /**
     * Hands the pass this world's changed chunks and its players' records, as they are now.
     * @param requireSuccess - Throw when a chunk cannot be cut, rather than log it and leave it dirty.
     */
    cutSave(pass: ProviderSavePass, players: Map<string, WorldPlayerData>, requireSuccess: boolean): void;
}

/** The level's own state as a cut takes it: the record the provider keeps, and `level.dat`. */
export interface LevelDataAtCut {
    readonly record: WorldPersistenceData;
    readonly levelDat: LevelDatInputs;
}

/** What {@link LevelSave} needs from the level that owns it. */
export interface LevelSaveOptions {
    /** The level's name, for log lines. */
    readonly name: string;
    /** The level's provider. */
    readonly provider: () => BaseProvider;
    readonly logger: () => Logger;
    /** The level's own state, or undefined for a level that writes none. */
    readonly levelData?: () => LevelDataAtCut;
    /**
     * Writes player records the provider does not keep, once the pass has committed. Their writes
     * are not part of the commit.
     */
    readonly savePlayers?: (records: ReadonlyMap<string, WorldPlayerData>, requireSuccess: boolean) => Promise<void>;
    /** Hears each pass that committed, with what it wrote. */
    readonly onCommitted?: (stats: SavePassStats) => void;
}

/** One pass from its cut until its commit. */
interface PendingPass {
    readonly pass: ProviderSavePass;
    readonly levelDat: LevelDatInputs | undefined;
    readonly players: ReadonlyMap<string, WorldPlayerData>;
    readonly requireSuccess: boolean;
}

/**
 * When and how one level is written to disk (ADR 0018).
 *
 * A pass writes the state of one tick boundary, for every dimension of the level, and commits it
 * as one atomic write. The autosave's cut runs in the tick, at its end, in one synchronous call:
 * every player record, every changed chunk and the level record. The chunks' changed sub chunks
 * are encoded over the following ticks, {@link SAVE_ENCODE_BUDGET} a tick, and the commit runs
 * outside the tick once the last is encoded. A save that is asked for, such as a shutdown's, cuts
 * between two ticks, when its turn comes, and encodes at once.
 *
 * Every pass goes through one queue, so a pass never runs beside another. A write made outside a
 * pass, such as a chunk the unload pass writes or a player's record on disconnect, does not wait
 * in the queue: the provider holds it, answers reads of its keys from it, and commits it ahead of
 * the next pass's own writes, in the same batch. A write held before a cut lands with that cut's
 * commit, and one held after it lands with the next. When the held writes pass
 * {@link HELD_WRITE_LIMIT}, the level commits them early, in a pass that cuts nothing.
 */
export class LevelSave {
    /** The write that is running, or null when none is. It settles when that write is done and never rejects. */
    private queue: Promise<void> | null = null;
    /** Settles when the pass between its cut and its commit has committed or failed, or null when none is. */
    private committing: Promise<void> | null = null;
    private settleCommitting: () => void = () => {};
    /** The autosave whose cut is taken and whose sub chunks are still encoding, or null. */
    private encoding: { readonly pending: PendingPass; readonly start: () => void } | null = null;

    public constructor(private readonly options: LevelSaveOptions) {
        // This is what commits the held writes, so it is what turns holding on.
        options.provider().holdOutsideWrites();
    }

    /**
     * Runs at the end of each level tick: encodes the next share of the autosave in progress,
     * takes the autosave's cut when one falls due and no other pass is running, or else commits
     * the held writes once they pass {@link HELD_WRITE_LIMIT}.
     *
     * The autosave is skipped rather than queued while another pass is running. A pass still
     * going when the next falls due has more to write than two minutes of ticks allowed, and
     * queueing would answer that with an ever-growing backlog of passes over the same chunks.
     * Nothing is lost by skipping, because a chunk this pass does not reach is still dirty and
     * the next one picks it up. Writes made outside a pass are held rather than queued, so a
     * stream of chunk unloads no longer delays it.
     *
     * @param tick - The level's clock after this tick.
     * @param worlds - The worlds the level ticked.
     */
    public tick(tick: number, worlds: readonly SavedWorld[]): void {
        if (this.encoding !== null) {
            this.advance(SAVE_ENCODE_BUDGET);
            return;
        }
        if (this.queue !== null) return;
        if (tick % AUTO_SAVE_INTERVAL_TICKS !== 0) {
            if (this.options.provider().heldWriteBytes() > HELD_WRITE_LIMIT) this.commitHeld();
            return;
        }

        let pending: PendingPass;
        try {
            pending = this.cut(worlds, false);
        } catch (error) {
            this.options.logger().error(`Failed to take the save cut of level ${this.options.name}`);
            this.options.logger().error(error);
            return;
        }

        let start!: () => void;
        const encoded = new Promise<void>((resolve) => {
            start = resolve;
        });
        // The queue was idle, so this takes the slot in this call, before the next write can.
        // Nothing awaits it - the tick that started it is over by the time it finishes - so a
        // rejection escaping would be an unhandled one, and the server runs with
        // `--unhandled-rejections=strict`. A save that fails is worth a log line and the next
        // pass; it is not worth the process.
        this.occupy(async () => {
            await encoded;
            await this.commit(pending);
        }).catch((error: unknown) => {
            this.options.logger().error(`Failed to save level ${this.options.name}`);
            this.options.logger().error(error);
        });
        this.encoding = { pending, start };
        this.advance(SAVE_ENCODE_BUDGET);
    }

    /**
     * Writes the worlds now: their players and changed chunks, and the level's own state.
     *
     * Queued behind whatever write is running rather than run beside it. An autosave still
     * encoding finishes its encodes first, since a shutdown stops the ticks that would.
     *
     * @param worlds - The worlds to write, ready or not.
     */
    public async save(worlds: readonly SavedWorld[]): Promise<void> {
        this.finishEncoding();
        await this.occupy(async () => {
            const pending = this.cut(worlds, false);
            await this.commit(pending);
        });
    }

    /**
     * {@link LevelSave.save}, failing on any write that did not land rather than logging it, for
     * a replay checkpoint, which cannot copy a save that missed something.
     */
    public async saveForReplay(worlds: readonly SavedWorld[]): Promise<void> {
        this.finishEncoding();
        await this.occupy(async () => {
            const pending = this.cut(worlds, true);
            await this.commit(pending);
        });
    }

    /**
     * Writes the level's own state now, in a pass that cuts no world: the level record and every
     * write held so far in one commit, then `level.dat`.
     *
     * Not left for the next autosave, because a caller asks for this when the state has to be on
     * disk: the first load writes the spawn it found, and an operator's command saves on
     * request. Queued behind a pass that is running, like {@link LevelSave.save}.
     */
    public async saveLevelData(): Promise<void> {
        this.finishEncoding();
        await this.occupy(async () => {
            const pending = this.cut([], false);
            await this.commit(pending);
        });
    }

    /**
     * Settles once a pass whose cut is taken has committed, or at once when none is pending. A
     * player record the provider does not keep waits for this, so it lands after the pass's
     * older one.
     */
    public pendingCommit(): Promise<void> {
        return this.committing ?? Promise.resolve();
    }

    /** Takes the queue's slot now and runs `write` once the write before it is done. */
    private async occupy(write: () => Promise<void>): Promise<void> {
        const previous = this.queue;
        let finished!: () => void;
        const slot = new Promise<void>((resolve) => {
            finished = resolve;
        });
        // Taken in the same turn this was called, before any await, so a shutdown arriving on the
        // next turn finds the promise to wait for.
        this.queue = slot;

        try {
            await previous;
            await write();
        } finally {
            if (this.queue === slot) this.queue = null;
            finished();
        }
    }

    /**
     * Commits the writes held so far in a pass that cuts nothing, once they have grown past
     * {@link HELD_WRITE_LIMIT}. Still one batch, so a crash keeps all of them or none.
     */
    private commitHeld(): void {
        const pending: PendingPass = {
            pass: this.options.provider().beginSavePass(),
            levelDat: undefined,
            players: new Map(),
            requireSuccess: false
        };
        // Nothing awaits it, as with the autosave; see `tick`.
        this.occupy(async () => this.commit(pending)).catch((error: unknown) => {
            this.options.logger().error(`Failed to commit the held writes of level ${this.options.name}`);
            this.options.logger().error(error);
        });
    }

    /** Takes the cut: every world's players and changed chunks, and the level's own state. */
    private cut(worlds: readonly SavedWorld[], requireSuccess: boolean): PendingPass {
        const pass = this.options.provider().beginSavePass();
        const players = new Map<string, WorldPlayerData>();
        try {
            for (const world of worlds) world.cutSave(pass, players, requireSuccess);
            const levelData = this.options.levelData?.();
            if (levelData !== undefined) pass.putLevelRecord(levelData.record);

            const elsewhere = new Map<string, WorldPlayerData>();
            for (const [key, record] of players) if (!pass.putPlayer(key, record)) elsewhere.set(key, record);

            let committed!: () => void;
            this.committing = new Promise<void>((resolve) => {
                committed = resolve;
            });
            this.settleCommitting = committed;
            return { pass, levelDat: levelData?.levelDat, players: elsewhere, requireSuccess };
        } catch (error) {
            pass.abandon();
            throw error;
        }
    }

    /** Encodes up to `budget` sub chunks of the autosave in progress, and starts its commit after the last. */
    private advance(budget: number): void {
        const encoding = this.encoding;
        if (encoding === null) return;
        encoding.pending.pass.encode(budget);
        if (encoding.pending.pass.pendingEncodes > 0) return;
        this.encoding = null;
        encoding.start();
    }

    /** Encodes what is left of the autosave in progress at once. */
    private finishEncoding(): void {
        this.advance(Number.POSITIVE_INFINITY);
    }

    /**
     * Commits a pass, then writes what is not part of the commit: the player records the
     * provider does not keep, and `level.dat`.
     */
    private async commit({ pass, levelDat, players, requireSuccess }: PendingPass): Promise<void> {
        const logger = this.options.logger();
        try {
            await pass.commit({ sync: true });
            this.options.onCommitted?.(pass.stats);
            const { keys, bytes } = pass.stats;
            logger.verbose(`Saved level ${this.options.name}: ${keys} keys, ${bytes} bytes`);
        } catch (error) {
            pass.abandon();
            logger.error(`Failed to save level ${this.options.name}; its chunks stay dirty for the next pass`);
            logger.error(error);
            if (requireSuccess) throw error;
            return;
        } finally {
            this.committing = null;
            this.settleCommitting();
        }

        if (players.size > 0) await this.options.savePlayers?.(players, requireSuccess);
        if (levelDat === undefined) return;
        try {
            this.options.provider().saveLevelData(levelDat);
        } catch (error) {
            logger.error(`Failed to save level data for ${this.options.name}`);
            logger.error(error);
            if (requireSuccess) throw error;
        }
    }
}
