import BreakBehavior from './BreakBehavior';
import ChatBehavior from './ChatBehavior';
import LookBehavior from './LookBehavior';
import WalkBehavior from './WalkBehavior';

import type { Behavior } from './Behavior';

/** Behaviors by the name the command line uses. */
export const BEHAVIORS: Record<string, () => Behavior> = {
    walk: () => new WalkBehavior(),
    look: () => new LookBehavior(),
    chat: () => new ChatBehavior(),
    break: () => new BreakBehavior()
};

export const BEHAVIOR_NAMES = Object.keys(BEHAVIORS);

/**
 * Builds behaviors from a list of names.
 * @param names - as given on the command line, e.g. `['walk', 'chat']`.
 * @throws when a name is not one of {@link BEHAVIOR_NAMES}, rather than silently running a
 * fleet that does less than was asked for - a load test quietly missing half its traffic is
 * worse than one that refuses to start.
 */
export const createBehaviors = (names: readonly string[]): Behavior[] =>
    names.map((name) => {
        const factory = BEHAVIORS[name];
        if (!factory) {
            throw new Error(`Unknown behavior "${name}". Known behaviors: ${BEHAVIOR_NAMES.join(', ')}`);
        }

        return factory();
    });
