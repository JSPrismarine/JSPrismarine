import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ServerSettingsRequestPacket from '../packet/ServerSettingsRequestPacket';
import ServerSettingsRequestHandler from './ServerSettingsRequestHandler';

describe('ServerSettingsRequestHandler', () => {
    it('answers nothing, rather than reapplying the adventure settings', () => {
        const logged: string[] = [];
        const settingsSent: unknown[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({
            getPlayer: () => stub<Player>({ getName: () => 'Steve' }),
            sendSettings: async (player) => void settingsSent.push(player)
        });

        new ServerSettingsRequestHandler().handle(new ServerSettingsRequestPacket(), server, session);

        expect(settingsSent).toEqual([]);
        expect(logged).toEqual(['Steve asked for the server settings form, which the server does not offer']);
    });
});
