import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { LoggedLines } from '../../testing/blockTarget.test.helper';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import PacketHandlerRegistry from '../PacketHandlerRegistry';
import SetPlayerFurnaceOptionsPacket, {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from '@jsprismarine/protocol/packet/SetPlayerFurnaceOptionsPacket';
import type { SetPlayerFurnaceOptions } from '@jsprismarine/protocol/packet/SetPlayerFurnaceOptionsPacket';
import SetPlayerFurnaceOptionsHandler from './SetPlayerFurnaceOptionsHandler';

const fakeSession = () => {
    const logged: LoggedLines = { debug: [], verbose: [] };
    const log = stub<Logger>({
        debug: (...message) => void logged.debug.push(message[0] ?? ''),
        verbose: (...message) => void logged.verbose.push(message[0] ?? '')
    });
    const session = stub<PlayerSession>({ identity: STEVE });

    return { logged, context: sessionContext(session, { log }) };
};

const DEFAULT_DATA: SetPlayerFurnaceOptions = {
    furnaceType: FurnaceType.Smoker,
    options: {
        leftTab: FurnaceLeftTabIndex.RecipeSearch,
        filtering: true,
        layout: FurnaceLayout.Default
    }
};

const options = (data: SetPlayerFurnaceOptions = DEFAULT_DATA) => new SetPlayerFurnaceOptionsPacket(data);

describe('SetPlayerFurnaceOptionsHandler', () => {
    it('logs the furnace, tab, filter and layout', () => {
        const { logged, context } = fakeSession();

        new SetPlayerFurnaceOptionsHandler().handle(options(), context);

        expect(logged.debug).toEqual([
            'Steve arranged the Smoker screen: tab RecipeSearch, filtering on, layout Default. Furnace options are not stored'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a furnace type outside the enum', () => {
        const { logged, context } = fakeSession();
        // Numeric enums accept any number; the wire can carry one the docs do not list.
        const unknown: number = 7;

        new SetPlayerFurnaceOptionsHandler().handle(options({ ...DEFAULT_DATA, furnaceType: unknown }), context);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual(['Dropped furnace options from Steve: 7 is not a furnace type']);
    });

    it('drops a tab outside the enum', () => {
        const { logged, context } = fakeSession();
        const unknown: number = 6;

        new SetPlayerFurnaceOptionsHandler().handle(
            options({ ...DEFAULT_DATA, options: { ...DEFAULT_DATA.options, leftTab: unknown } }),
            context
        );

        expect(logged.verbose).toEqual(['Dropped furnace options from Steve: 6 is not a furnace tab']);
    });

    it('drops a layout outside the enum', () => {
        const { logged, context } = fakeSession();
        const unknown: number = -1;

        new SetPlayerFurnaceOptionsHandler().handle(
            options({ ...DEFAULT_DATA, options: { ...DEFAULT_DATA.options, layout: unknown } }),
            context
        );

        expect(logged.verbose).toEqual(['Dropped furnace options from Steve: -1 is not a furnace layout']);
    });

    it('registers the handler for SetPlayerFurnaceOptionsPacket', async () => {
        const registry = new PacketHandlerRegistry({
            getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} })
        });

        await registry.enable();

        expect(registry.getHandler('SetPlayerFurnaceOptionsPacket')).toBeInstanceOf(SetPlayerFurnaceOptionsHandler);
    });
});
