/**
 * Changes one world sends another, applied at the input step
 * ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 *
 * An input applied in one world's input step writes only that world. A change it has for a
 * player or a block in another world is filed here, and the input step applies it in the world
 * it names as a unit of that world's change log, after the inputs and the chunk completions,
 * in the order the messages were filed. A message filed during a step is applied in that step's
 * share when the share has not run yet, and in the next step's otherwise.
 *
 * A message is applied in the world it was filed for. One about a player checks at admission that
 * the player is still in that world, and files itself again for the world they are in now if not:
 * the unit it runs in can only undo writes to its own world.
 */
import type { World } from './World';

/** One change for a world, with the world it is for. */
interface WorldMessage {
    readonly world: World;
    /** Writes in its world's unit and queues its sends, waiting for nothing. */
    readonly apply: () => undefined;
}

/**
 * How many passes {@link WorldMessages.drain} makes. A message files another one when its player
 * changed world, and that one applies in the next pass, so two passes are the most real messages
 * need. The rest is room for a message that files one that files one, without letting a message
 * that files itself for ever hold a shutdown.
 */
const DRAIN_PASSES = 8;

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
     * @param apply - The change. It writes and queues its sends, and waits for nothing, which is
     *   why it returns `undefined` and not `void`: an async function satisfies `void`, and the
     *   unit would close, and count the message applied, before the writes after its first wait.
     */
    public send(world: World, apply: () => undefined): void {
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

    /**
     * Applies messages until none is left, for a caller no input step follows, such as a
     * shutdown. {@link WorldMessages.admit} applies what was filed before it and leaves what
     * those messages file for the next step, which never comes there: a message about a player
     * who changed world files itself again for the world they are in now, and would be dropped.
     *
     * Messages still filing themselves after {@link DRAIN_PASSES} passes are reported and left.
     *
     * @returns How many messages were applied.
     */
    public drain(): number {
        let applied = 0;
        for (let pass = 0; pass < DRAIN_PASSES && this.pending.length > 0; pass += 1) applied += this.admit();
        if (this.pending.length > 0) {
            this.report(
                new Error(`${this.pending.length} world message(s) were still being filed after ${DRAIN_PASSES} passes`)
            );
        }
        return applied;
    }
}
