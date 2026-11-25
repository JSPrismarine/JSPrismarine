import { describe, expect, it } from 'vitest';

import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import SetSprintingHandler from './SetSprintingHandler';

describe('SetSprintingHandler', () => {
    it('sets the sprint through the session, handing its sends to the step', async () => {
        const sprints: boolean[] = [];
        const session = stub<PlayerSession>({ setSprinting: async (sprinting) => void sprints.push(sprinting) });
        const { context, outputs, settled } = inputContext(session);

        new SetSprintingHandler().handle({ kind: 'setSprinting', sprinting: true }, context);
        await settled();

        expect(sprints).toEqual([true]);
        expect(outputs).toHaveLength(1);
    });
});
