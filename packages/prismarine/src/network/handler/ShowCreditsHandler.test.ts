import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import * as Handlers from '../Handlers';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import ShowCreditsHandler from './ShowCreditsHandler';

describe('ShowCreditsHandler', () => {
    const run = async (creditsState: CreditsState, { pending = false } = {}) => {
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
        const packet = Object.assign(new ShowCreditsPacket(), { creditsState });

        const { context, settled } = inputContext(session, {
            log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });

        new ShowCreditsHandler().handle(packet, context);
        // The world change is a message the session files, so the handler finishes the credits itself.
        const completedInHandler = completions;
        await settled();
        return { logged, completions, completedInHandler };
    };

    it('finishes the pending credits when the client reports them over, without a log', async () => {
        const { logged, completions, completedInHandler } = await run(CreditsState.Finished, {
            pending: true
        });

        expect(completedInHandler).toBe(1);
        expect(completions).toBe(1);
        expect(logged).toEqual([]);
    });

    it('logs a finish that no pending credits were waiting for, and drops it', async () => {
        const { logged, completions } = await run(CreditsState.Finished);

        expect(completions).toBe(1);
        expect(logged).toEqual(['Steve reported the end credits finished with none pending']);
    });

    it('logs a client-sent start and drops it', async () => {
        const { logged, completions } = await run(CreditsState.Start);
        expect(completions).toBe(0);
        expect(logged).toEqual(['Steve reported the end credits started, which only the server may say']);
    });

    it('is registered for packet 0x4b', () => {
        expect(Handlers.ShowCreditsHandler).toBe(ShowCreditsHandler);
        expect(ShowCreditsHandler.PacketName).toBe('ShowCreditsPacket');
    });
});
