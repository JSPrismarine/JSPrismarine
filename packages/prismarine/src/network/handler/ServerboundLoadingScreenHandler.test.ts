import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import type { Arrival } from '../PlayerSession';
import ServerboundLoadingScreenPacket, {
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import ServerboundLoadingScreenHandler from './ServerboundLoadingScreenHandler';

const fakeSession = ({ open = [] as number[], pending = undefined as number | undefined } = {}) => {
    const logged: string[] = [];
    const ended: number[] = [];
    /** Every id the handler asked the session to finish a dimension change under. */
    const completed: number[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({
        getPlayer: () => stub<Player>({ getName: () => 'Steve' }),
        endLoadingScreen: (id) => {
            ended.push(id);
            return open.includes(id);
        },
        pendingDimensionChange: () =>
            pending === undefined ? undefined : { loadingScreenId: pending, arrival: stub<Arrival>() },
        completeDimensionChange: async (id) => {
            completed.push(id);
            return id === pending;
        }
    });

    return { logged, ended, completed, server, session };
};

describe('ServerboundLoadingScreenHandler', () => {
    it('logs the join screen when the id is absent', () => {
        const { logged, server, session } = fakeSession();
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
            loadingScreenId: null
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve opened the join loading screen']);
    });

    it('closes the screen on the session when the client reports the id it was given', async () => {
        const { logged, ended, server, session } = fakeSession({ open: [3] });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 3
        });

        await new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(ended).toEqual([3]);
        expect(logged).toEqual(['Steve closed loading screen 3']);
    });

    it('finishes the pending dimension change when its screen closes', async () => {
        const { logged, completed, server, session } = fakeSession({ open: [3], pending: 3 });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 3
        });

        await new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(completed).toEqual([3]);
        expect(logged).toEqual(['Steve closed loading screen 3']);
    });

    it('logs a closed screen that is not the pending change and leaves the change pending', async () => {
        const { logged, completed, server, session } = fakeSession({ open: [2, 3], pending: 3 });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 2
        });

        await new ServerboundLoadingScreenHandler().handle(packet, server, session);

        // The session is asked and says no; the id did not match.
        expect(completed).toEqual([2]);
        expect(logged).toEqual(['Steve closed loading screen 2, not screen 3 of the pending dimension change']);
    });

    it('says so when the closed id matches no screen the session opened', async () => {
        const { logged, server, session } = fakeSession();
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 9
        });

        await new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve closed loading screen 9, which this session never opened']);
    });

    it('only logs an opening, since the session already knows the id', () => {
        const { logged, ended, server, session } = fakeSession({ open: [3] });
        const packet = new ServerboundLoadingScreenPacket({
            loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(ended).toEqual([]);
        expect(logged).toEqual(['Steve opened loading screen 3']);
    });
});
