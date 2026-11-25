import { describe, expect, it } from 'vitest';

import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import PressRespawnHandler from './PressRespawnHandler';

describe('PressRespawnHandler', () => {
    it('files the respawn, which the respawn search answers in a later input step', () => {
        let requested = 0;
        const session = stub<PlayerSession>({ requestRespawn: () => void (requested += 1) });

        new PressRespawnHandler().handle({ kind: 'pressRespawn' }, inputContext(session).context);

        expect(requested).toBe(1);
    });
});
