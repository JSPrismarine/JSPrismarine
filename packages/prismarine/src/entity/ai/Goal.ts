import type { Mob } from '../Mob';

/**
 * One thing a mob might want to be doing.
 *
 * Behaviour is built out of small independent goals rather than one big state machine per mob,
 * because the things a mob does overlap: it wanders, and it looks at you, and it panics when hurt,
 * and those are three separate concerns that a state machine would have to enumerate the product
 * of. A goal only has to answer "would I like to run" and "am I still going".
 */
export interface Goal {
    /** Used in logs and tests. */
    readonly name: string;

    /**
     * Lower runs first, and a running goal blocks every higher number that shares a lane with it.
     * Panicking is 0; standing around looking at things is 6.
     */
    readonly priority: number;

    /**
     * Which parts of the mob this goal drives - see {@link GoalLane}.
     *
     * Two goals can run at once as long as they want different parts: strolling moves the legs,
     * watching a player turns the head, and there is no reason a mob cannot do both.
     */
    readonly lanes: readonly GoalLane[];

    /** Whether this goal wants to start now. Called only while the goal is not running. */
    canUse(mob: Mob): boolean;

    /** Whether a running goal wants to keep going. Defaults to {@link canUse} when absent. */
    canContinue?(mob: Mob): boolean;

    start?(mob: Mob): void;
    stop?(mob: Mob): void;

    /** Called once per tick while the goal is running. */
    tick(mob: Mob): void;
}

/** The parts of a mob a goal can claim, so unrelated goals can run together. */
export enum GoalLane {
    /** Where the mob is going. */
    Move = 'move',
    /** Where it is looking. */
    Look = 'look',
    /** Jumping, swimming and the like. */
    Body = 'body'
}
