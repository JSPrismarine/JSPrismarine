import { SerialQueue } from '../utils/serialQueue';

/** What a {@link ScriptSlot} holds: running scripts it can reload in place or close. */
export interface SlotScripts {
    /** Runs every pack again from its top level, from the pack descriptors it already read. */
    reload(): void;
    /** Stops the scripts for good. */
    close(): void;
}

/** Loads and starts scripts from a list of pack folders, or answers undefined when none has scripts. */
export type StartScripts<Scripts extends SlotScripts> = (packs: readonly string[]) => Promise<Scripts | undefined>;

/**
 * The default level's running scripts and the pack list they came from. A start, a reload and a
 * stop each replace what the slot holds. Starts and reloads run one at a time, in the order they
 * were asked for, so `/reload` during the first start, or beside an addon command, cannot start a
 * second set of scripts. A stop cancels a start that has not run yet, and a start it overtook while
 * loading closes what it loaded rather than attaching it.
 */
export class ScriptSlot<Scripts extends SlotScripts> {
    private scripts: Scripts | undefined;
    /** The packs of the last start, or undefined before the first and after a stop. */
    private packs: readonly string[] | undefined;
    /** Counts starts and stops, so a start can tell whether another one overtook it. */
    private generation = 0;
    /** The starts and reloads, each run after the one before it settled. */
    private readonly queue = new SerialQueue();

    /** The running scripts, or undefined when none run. */
    public get current(): Scripts | undefined {
        return this.scripts;
    }

    /**
     * Starts scripts from a pack list, after the starts and reloads asked for before it. The list
     * is recorded before the load, so a load that throws still leaves the list a later reload
     * compares against. A stop asked for before the start's turn cancels it.
     */
    public start(packs: readonly string[], start: StartScripts<Scripts>): Promise<void> {
        const generation = this.generation;
        return this.queue.run(async () => {
            if (generation === this.generation) await this.load(packs, start);
        });
    }

    /** Closes the running scripts and forgets the pack list; a start still loading closes what it loads. */
    public stop(): void {
        this.generation++;
        this.scripts?.close();
        this.scripts = undefined;
        this.packs = undefined;
    }

    /**
     * Reloads the scripts after the starts and reloads asked for before it. Running scripts whose
     * pack list is unchanged reload in place. Otherwise, or when `restart` asks for it, the scripts
     * close and start again from the list, which reads each pack's manifest again.
     *
     * @param packs - Reads the pack list when this reload's turn comes, after the slot has started.
     * @param options - `restart` starts over even from the same list, for packs that changed in place.
     * @returns Whether anything reloaded: false before the first start and after a stop.
     */
    public reload(
        packs: () => readonly string[],
        start: StartScripts<Scripts>,
        options: { readonly restart?: boolean } = {}
    ): Promise<boolean> {
        return this.queue.run(async () => {
            if (this.packs === undefined) return false;
            const now = packs();
            const scripts = this.scripts;
            if (scripts !== undefined && options.restart !== true && samePacks(this.packs, now)) {
                scripts.reload();
                return true;
            }
            await this.load(now, start);
            return true;
        });
    }

    /** Closes the running scripts and loads new ones from a pack list. */
    private async load(packs: readonly string[], start: StartScripts<Scripts>): Promise<void> {
        const generation = ++this.generation;
        this.scripts?.close();
        this.scripts = undefined;
        this.packs = packs;
        const scripts = await start(packs);
        if (generation !== this.generation) {
            scripts?.close();
            return;
        }
        this.scripts = scripts;
    }
}

const samePacks = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((pack, index) => pack === b[index]);
