import { describe, expect, it } from 'vitest';

import PlayerButtonInputEvent from '../../events/player/PlayerButtonInputEvent';
import type PlayerSession from '../../player/PlayerSession';
import type { HandlerServices } from '../../player/context/HandlerContext';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import HoldButtonsHandler from './HoldButtonsHandler';

describe('HoldButtonsHandler', () => {
    it('raises playerButtonInput for each button pressed or let go since the last report', () => {
        const session = stub<PlayerSession>({});
        const heard: string[] = [];
        const events = stub<HandlerServices['events']>({
            post: (_name, event) => {
                if (event instanceof PlayerButtonInputEvent) {
                    heard.push(`${event.getButton()} ${event.isPressed() ? 'pressed' : 'released'}`);
                }
                return 0;
            }
        });
        const { context } = inputContext(session, { services: { events } });
        const handler = new HoldButtonsHandler();

        handler.handle({ kind: 'holdButtons', jump: true, sneak: false }, context);
        handler.handle({ kind: 'holdButtons', jump: true, sneak: false }, context);
        handler.handle({ kind: 'holdButtons', jump: false, sneak: true }, context);

        expect(heard).toEqual(['Jump pressed', 'Jump released', 'Sneak pressed']);
    });
});
