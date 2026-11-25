import { describe, expect, it } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../../player/PlayerSession';
import OpenInventoryHandler from './OpenInventoryHandler';

describe('OpenInventoryHandler', () => {
    it('opens the main inventory and hands its sends to the step', async () => {
        const opened: number[] = [];
        const session = stub<PlayerSession>({
            identity: identityNamed('tester'),
            openMainInventory: async () => {
                opened.push(1);
            }
        });
        const { context, outputs, settled } = inputContext(session);

        expect(new OpenInventoryHandler().handle({ kind: 'openInventory' }, context)).toBeUndefined();
        // The open's sends go to the input step rather than being awaited.
        expect(outputs).toHaveLength(1);
        await settled();

        expect(opened).toHaveLength(1);
    });
});
