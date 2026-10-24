import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ServerboundLoadingScreenPacket, { LoadingScreenPacketType } from '../packet/ServerboundLoadingScreenPacket';
import ServerboundLoadingScreenHandler from './ServerboundLoadingScreenHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
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

    it('logs the id when the server assigned one', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new ServerboundLoadingScreenPacket(), {
            loadingScreenType: LoadingScreenPacketType.EndLoadingScreen,
            loadingScreenId: 3
        });

        new ServerboundLoadingScreenHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve closed loading screen 3']);
    });
});
