/**
 * Changes one world sends another, applied at the input step
 * ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 *
 * An input applied in one world's input step writes only that world. A change it has for a
 * player or a block in another world is filed here, and the input step applies it in the world
 * it names as a unit of that world's change log, after the inputs and the chunk completions,
 * in the order the messages were filed. A message filed during a step is applied in that step's
 * share when the share has not run yet, and in the next step's otherwise.
 */
import type { World } from './World';

/** One change for a world, with the world it is for. */
interface WorldMessage {
    readonly world: World;
    /** Writes in its world's unit and queues its sends, waiting for nothing. */
    readonly apply: () => void;
}

/** The changes waiting for an input step to apply them in their worlds. */
export class WorldMessages {
    private pending: WorldMessage[] = [];

    public constructor(private readonly report: (error: unknown) => void) {}

    /** How many messages wait for an input step. */
    public get size(): number {
        return this.pending.length;
    }

    /**
     * Files a change for a world.
     *
     * @param world - The world the change writes.
     * @param apply - The change. It writes and queues its sends, and waits for nothing.
     */
    public send(world: World, apply: () => void): void {
        this.pending.push({ world, apply });
    }

    /**
     * The input step's share: applies every message filed before it, each as a unit of its
     * world's change log, in the order they were filed. A message that throws is undone and
     * reported, and the rest still apply.
     *
     * @returns How many messages were applied.
     */
    public admit(): number {
        const due = this.pending;
        this.pending = [];
        let applied = 0;
        for (const { world, apply } of due) {
            try {
                world.runInputNow(apply);
                applied += 1;
            } catch (error: unknown) {
                this.report(error);
            }
        }
        return applied;
    }
}
