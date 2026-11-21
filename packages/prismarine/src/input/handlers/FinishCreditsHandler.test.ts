import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../../network/PlayerSession';
import FinishCreditsHandler from './FinishCreditsHandler';

const run = ({ pending = false } = {}) => {
    const logged: string[] = [];
    /** How many times the handler asked the session to finish the credits. */
    let completions = 0;
    const session = stub<PlayerSession>({
        identity: STEVE,
        completeCredits: () => {
            completions += 1;
            return pending;
        }
    });
    const { context, outputs } = inputContext(session, {
        log: stub<Logger>({ debug: (...message) => void logged.push(String(message[0] ?? '')) })
    });

    new FinishCreditsHandler().handle({ kind: 'finishCredits' }, context);
    return { logged, completions, outputs };
};

describe('FinishCreditsHandler', () => {
    it('finishes the pending credits in the handler, without a log and with nothing to wait for', () => {
        const { logged, completions, outputs } = run({ pending: true });

        // The world change is a message the session files, so the handler finishes the credits itself.
        expect(completions).toBe(1);
        expect(outputs).toEqual([]);
        expect(logged).toEqual([]);
    });

    it('logs a finish that no pending credits were waiting for', () => {
        const { logged, completions } = run();

        expect(completions).toBe(1);
        expect(logged).toEqual(['Steve reported the end credits finished with none pending']);
    });
});
