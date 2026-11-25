import { describe, expect, it } from 'vitest';

import type { HandlerServices } from '../../player/context/HandlerContext';
import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import RunCommandHandler from './RunCommandHandler';

describe('RunCommandHandler', () => {
    it('dispatches the command line with the player as both sender and target', async () => {
        const dispatched: string[] = [];
        const senders: unknown[] = [];
        const session = stub<PlayerSession>({});
        const { context, outputs, settled } = inputContext(session, {
            services: {
                commands: stub<HandlerServices['commands']>({
                    runCommand: (sender, target, input) => {
                        senders.push(sender, target);
                        dispatched.push(input ?? '');
                        return { ran: true, settled: Promise.resolve() };
                    }
                })
            }
        });

        expect(
            new RunCommandHandler().handle({ kind: 'runCommand', command: '/gamerule showcoordinates true' }, context)
        ).toBeUndefined();
        // The command runs in the handler, which hands the step what it started.
        expect(outputs).toHaveLength(1);
        await settled();

        expect(dispatched).toEqual(['/gamerule showcoordinates true']);
        expect(senders).toEqual([session, session]);
    });
});
