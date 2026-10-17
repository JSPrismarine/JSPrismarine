import BreakBehaviour from './BreakBehaviour';
import ChatBehaviour from './ChatBehaviour';
import LookBehaviour from './LookBehaviour';
import WalkBehaviour from './WalkBehaviour';

import type { Behaviour } from './Behaviour';

/** Behaviours by the name the command line uses. */
export const BEHAVIOURS: Record<string, () => Behaviour> = {
    walk: () => new WalkBehaviour(),
    look: () => new LookBehaviour(),
    chat: () => new ChatBehaviour(),
    break: () => new BreakBehaviour()
};

export const BEHAVIOUR_NAMES = Object.keys(BEHAVIOURS);

/**
 * Builds behaviours from a list of names.
 * @param names - as given on the command line, e.g. `['walk', 'chat']`.
 * @throws when a name is not one of {@link BEHAVIOUR_NAMES}, rather than silently running a
 * fleet that does less than was asked for - a load test quietly missing half its traffic is
 * worse than one that refuses to start.
 */
export const createBehaviours = (names: readonly string[]): Behaviour[] =>
    names.map((name) => {
        const factory = BEHAVIOURS[name];
        if (!factory) {
            throw new Error(`Unknown behaviour "${name}". Known behaviours: ${BEHAVIOUR_NAMES.join(', ')}`);
        }

        return factory();
    });
