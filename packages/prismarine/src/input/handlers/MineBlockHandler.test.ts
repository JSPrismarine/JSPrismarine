import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import BlockPosition from '../../world/BlockPosition';
import { inputContext } from '../../testing/handlerContext.test.helper';
import type { MiningScene } from '../../testing/miningScene.test-utils';
import { miningScene } from '../../testing/miningScene.test-utils';
import type { Intent, MiningStep } from '../Intent';
import MineBlockHandler from './MineBlockHandler';

const BLOCK = new BlockPosition(1, 0, 1);

/** A step as a Java client's `Player Action` decodes into it: timed by the server, broken at once when it can be. */
const javaStep = (step: MiningStep): Intent<'mineBlock'> => ({
    kind: 'mineBlock',
    step,
    position: { x: BLOCK.getX(), y: BLOCK.getY(), z: BLOCK.getZ() },
    face: 1,
    serverTimed: true,
    breaksIfInstant: true
});

/** Applies one step as the input step does. */
const mine = async ({ session, log, clock }: MiningScene, intent: Intent<'mineBlock'>) => {
    const { context, settled } = inputContext(session, { log, tick: clock.tick });
    new MineBlockHandler().handle(intent, context);
    await settled();
};

describe('MineBlockHandler for a client that breaks an instant block on the start alone', () => {
    it('breaks a block that gives way at once when mining starts', async () => {
        const scene = miningScene(Gametype.SURVIVAL, { breakSeconds: 0 });

        await mine(scene, javaStep('start'));

        expect(scene.broken).toEqual([BLOCK]);
        expect(scene.state.mining).toBeNull();
    });

    it('only starts the cracks on a block that takes time, and breaks it when the finish comes in time', async () => {
        const scene = miningScene(Gametype.SURVIVAL, { breakSeconds: 1 });

        await mine(scene, javaStep('start'));
        expect(scene.broken).toEqual([]);
        expect(scene.cracking).toEqual(['start 1,0,1 (none)']);

        scene.clock.tick = 20;
        await mine(scene, javaStep('finish'));

        expect(scene.broken).toEqual([BLOCK]);
    });

    it('breaks nothing for an adventure player, whose start only starts the cracks', async () => {
        const scene = miningScene(Gametype.ADVENTURE, { breakSeconds: 0 });

        await mine(scene, javaStep('start'));

        expect(scene.broken).toEqual([]);
    });

    it('puts a creative break back on the screen of a player who is not in creative', async () => {
        const scene = miningScene(Gametype.SURVIVAL);

        await mine(scene, javaStep('instant'));

        expect(scene.broken).toEqual([]);
        expect(scene.resent).toEqual([BLOCK]);
    });
});
