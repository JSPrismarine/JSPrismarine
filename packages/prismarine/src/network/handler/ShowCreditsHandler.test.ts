import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import * as Handlers from '../Handlers';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import ShowCreditsHandler from './ShowCreditsHandler';

describe('ShowCreditsHandler', () => {
    const run = async (creditsState: CreditsState, { pending = false } = {}) => {
        const logged: string[] = [];
        /** How many times the handler asked the session to finish the credits. */
        let completions = 0;
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({
            getPlayer: () => stub<Player>({ getName: () => 'Steve' }),
            completeCredits: async () => {
                completions += 1;
                return pending;
            }
        });
        const packet = Object.assign(new ShowCreditsPacket(), { creditsState });

        await new ShowCreditsHandler().handle(packet, server, session);
        return { logged, completions };
    };

    it('finishes the pending credits when the client reports them over, without a log', async () => {
        const { logged, completions } = await run(CreditsState.Finished, { pending: true });

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
