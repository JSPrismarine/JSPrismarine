import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { LoggedLines } from '../../testing/blockTarget.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SetPlayerFurnaceOptionsPacket, {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from '../packet/SetPlayerFurnaceOptionsPacket';
import SetPlayerFurnaceOptionsHandler from './SetPlayerFurnaceOptionsHandler';

const fakeSession = () => {
    const logged: LoggedLines = { debug: [], verbose: [] };
    const server = stub<Server>({
        getLogger: () =>
            stub<Logger>({
                debug: (...message) => void logged.debug.push(message[0] ?? ''),
                verbose: (...message) => void logged.verbose.push(message[0] ?? '')
            })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

const options = (fields: Partial<SetPlayerFurnaceOptionsPacket> = {}) =>
    Object.assign(new SetPlayerFurnaceOptionsPacket(), {
        furnaceType: FurnaceType.Smoker,
        leftTab: FurnaceLeftTabIndex.RecipeSearch,
        filtering: true,
        layout: FurnaceLayout.Default,
        ...fields
    });

describe('SetPlayerFurnaceOptionsHandler', () => {
    it('logs the furnace, tab, filter and layout', () => {
        const { logged, server, session } = fakeSession();

        new SetPlayerFurnaceOptionsHandler().handle(options(), server, session);

        expect(logged.debug).toEqual([
            'Steve arranged the Smoker screen: tab RecipeSearch, filtering on, layout Default. Furnace options are not stored'
        ]);
        expect(logged.verbose).toEqual([]);
    });

    it('drops a furnace type outside the enum', () => {
        const { logged, server, session } = fakeSession();
        // Numeric enums accept any number; the wire can carry one the docs do not list.
        const unknown: number = 7;

        new SetPlayerFurnaceOptionsHandler().handle(options({ furnaceType: unknown }), server, session);

        expect(logged.debug).toEqual([]);
        expect(logged.verbose).toEqual(['Dropped furnace options from Steve: 7 is not a furnace type']);
    });

    it('drops a tab outside the enum', () => {
        const { logged, server, session } = fakeSession();
        const unknown: number = 6;

        new SetPlayerFurnaceOptionsHandler().handle(options({ leftTab: unknown }), server, session);

        expect(logged.verbose).toEqual(['Dropped furnace options from Steve: 6 is not a furnace tab']);
    });

    it('drops a layout outside the enum', () => {
        const { logged, server, session } = fakeSession();
        const unknown: number = -1;

        new SetPlayerFurnaceOptionsHandler().handle(options({ layout: unknown }), server, session);

        expect(logged.verbose).toEqual(['Dropped furnace options from Steve: -1 is not a furnace layout']);
    });
});
