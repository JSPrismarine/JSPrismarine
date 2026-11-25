import { describe, expect, it } from 'vitest';

import PlayerScriptMessageEvent from '../../events/player/PlayerScriptMessageEvent';
import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import ScriptMessageHandler from './ScriptMessageHandler';

describe('input/handlers/ScriptMessageHandler', () => {
    it("raises the message as the server's playerScriptMessage event, in the handler's unit", () => {
        const posted: Array<[string, unknown]> = [];
        const session = stub<PlayerSession>({ identity: identityNamed('tester') });
        const { context, outputs } = inputContext(session, {
            services: {
                events: {
                    post: (name, event) => {
                        posted.push([name, event]);
                        return 0;
                    }
                }
            }
        });

        new ScriptMessageHandler().handle({ kind: 'scriptMessage', id: 'hud:score', value: '42' }, context);

        expect(outputs).toEqual([]);
        expect(posted).toHaveLength(1);
        const [name, event] = posted[0]!;
        expect(name).toBe('playerScriptMessage');
        expect(event).toBeInstanceOf(PlayerScriptMessageEvent);
    });
});
