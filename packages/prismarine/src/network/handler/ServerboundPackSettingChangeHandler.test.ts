import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import UUID from '../../utils/UUID';
import type PlayerSession from '../PlayerSession';
import ServerboundPackSettingChangePacket from '../packet/ServerboundPackSettingChangePacket';
import ServerboundPackSettingChangeHandler from './ServerboundPackSettingChangeHandler';

describe('ServerboundPackSettingChangeHandler', () => {
    it('logs the pack, setting, and value', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packId = UUID.fromString('12345678-1234-1234-1234-123456789abc');
        const packet = Object.assign(new ServerboundPackSettingChangePacket(), {
            packId,
            packSettingName: 'fog',
            packSettingValue: ['near', 'far']
        });

        new ServerboundPackSettingChangeHandler().handle(packet, server, session);

        expect(logged).toEqual([
            `Steve set fog of pack ${packId.toString()} to ["near","far"], which the server does not store`
        ]);
    });
});
