import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ServerboundLoadingScreenPacket, { LoadingScreenPacketType } from '../packet/ServerboundLoadingScreenPacket';
import ServerboundLoadingScreenHandler from './ServerboundLoadingScreenHandler';

const fakeSession = ({ open = [] as number[] } = {}) => {
    const logged: string[] = [];
    const ended: number[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({
        getPlayer: () => stub<Player>({ getName: () => 'Steve' }),
        endLoadingScreen: (id) => {
            ended.push(id);
            return open.includes(id);
        }
    });

    return { logged, ended, server, session };
};

describe('ServerboundLoadingScreenHandler', () => {
    it('logs the join screen when the id is absent', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new ServerboundLoadingScreenPacket(), {
            loadingScreenType: LoadingScreenPacketType.StartLoadingScreen
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve opened the join loading screen']);
    });

    it('closes the screen on the session when the client reports the id it was given', () => {
        const { logged, ended, server, session } = fakeSession({ open: [3] });
        const packet = Object.assign(new ServerboundLoadingScreenPacket(), {
            loadingScreenType: LoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(ended).toEqual([3]);
        expect(logged).toEqual(['Steve closed loading screen 3']);
    });

    it('says so when the closed id matches no screen the session opened', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new ServerboundLoadingScreenPacket(), {
            loadingScreenType: LoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 9
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve closed loading screen 9, which this session never opened']);
    });

    it('only logs an opening, since the session already knows the id', () => {
        const { logged, ended, server, session } = fakeSession({ open: [3] });
        const packet = Object.assign(new ServerboundLoadingScreenPacket(), {
            loadingScreenType: LoadingScreenPacketType.StartLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(ended).toEqual([]);
        expect(logged).toEqual(['Steve opened loading screen 3']);
    });
});
