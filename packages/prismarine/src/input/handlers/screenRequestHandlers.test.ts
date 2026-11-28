import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionSeeingBlocks } from '../../editions/bedrock/handler/blockTargetSession.test.helper';
import type PlayerSession from '../../player/PlayerSession';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import DamageAnvilHandler from './DamageAnvilHandler';
import SetRecipeBookHandler from './SetRecipeBookHandler';
import ToggleCrafterSlotHandler from './ToggleCrafterSlotHandler';
import UseLabTableHandler from './UseLabTableHandler';

describe('DamageAnvilHandler', () => {
    it('logs the position of an anvil in reach, whatever its wear', () => {
        const { logged, context } = sessionSeeingBlocks({
            '3,2,2': 'minecraft:anvil',
            '1,2,2': 'minecraft:damaged_anvil'
        });
        const handler = new DamageAnvilHandler();

        handler.handle({ kind: 'damageAnvil', position: { x: 3, y: 2, z: 2 } }, context);
        handler.handle({ kind: 'damageAnvil', position: { x: 1, y: 2, z: 2 } }, context);

        expect(logged.debug).toEqual([
            'Steve asked to damage the anvil at 3, 2, 2. Anvils are not modeled',
            'Steve asked to damage the anvil at 1, 2, 2. Anvils are not modeled'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no anvil', () => {
        const { logged, context } = sessionSeeingBlocks({ '1,2,2': 'minecraft:iron_block' });

        new DamageAnvilHandler().handle({ kind: 'damageAnvil', position: { x: 1, y: 2, z: 2 } }, context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped an anvil damage request from Steve at 1, 2, 2: the block there is minecraft:iron_block'
        ]);
    });
});

describe('ToggleCrafterSlotHandler', () => {
    const toggle = (slot: number) =>
        ({ kind: 'toggleCrafterSlot', position: { x: 1, y: 2, z: 3 }, slot, disabled: true }) as const;

    it('logs the slot toggle and position of a crafter in reach', () => {
        const { logged, context } = sessionSeeingBlocks({ '1,2,3': 'minecraft:crafter' });

        new ToggleCrafterSlotHandler().handle(toggle(4), context);

        expect(logged.debug).toEqual(['Steve disabled slot 4 of the crafter at 1, 2, 3. Crafters are not stored']);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a slot a crafter does not have', () => {
        const { logged, context } = sessionSeeingBlocks({ '1,2,3': 'minecraft:crafter' });

        new ToggleCrafterSlotHandler().handle(toggle(9), context);
        new ToggleCrafterSlotHandler().handle(toggle(-1), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a crafter slot toggle from Steve at 1, 2, 3: a crafter has no slot 9',
            'Dropped a crafter slot toggle from Steve at 1, 2, 3: a crafter has no slot -1'
        ]);
    });

    it('drops a position that holds no crafter', () => {
        const { logged, context } = sessionSeeingBlocks({ '1,2,3': 'minecraft:dropper' });

        new ToggleCrafterSlotHandler().handle(toggle(4), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a crafter slot toggle from Steve at 1, 2, 3: the block there is minecraft:dropper'
        ]);
    });
});

describe('UseLabTableHandler', () => {
    const use = { kind: 'useLabTable', position: { x: 4, y: 1, z: 2 }, action: 'StartCombine' } as const;

    it('logs the action and the position of a lab table in reach', () => {
        const { logged, context } = sessionSeeingBlocks({ '4,1,2': 'minecraft:lab_table' });

        new UseLabTableHandler().handle(use, context);

        expect(logged.debug).toEqual([
            'Steve ran StartCombine on the lab table at 4, 1, 2. Chemistry is not simulated'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a position that holds no lab table', () => {
        const { logged, context } = sessionSeeingBlocks({ '4,1,2': 'minecraft:crafting_table' });

        new UseLabTableHandler().handle(use, context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual([
            'Dropped a lab table action from Steve at 4, 1, 2: the block there is minecraft:crafting_table'
        ]);
    });
});

describe('SetRecipeBookHandler', () => {
    it("logs a book's settings, and leaves out whether it is open when the client did not say", () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const context = sessionContext(stub<PlayerSession>({ identity: STEVE }), { log });
        const handler = new SetRecipeBookHandler();

        handler.handle({ kind: 'setRecipeBook', book: 'smoker', open: true, filtering: false }, context);
        handler.handle({ kind: 'setRecipeBook', book: 'crafting', open: null, filtering: true }, context);

        expect(logged).toEqual([
            'Steve set the smoker recipe book: open, filtering off. Recipe book settings are not stored',
            'Steve set the crafting recipe book: filtering on. Recipe book settings are not stored'
        ]);
    });
});
