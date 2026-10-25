import { describe, expect, it } from 'vitest';

import type { CommandManager } from '../../command/CommandManager';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SettingsCommandPacket from '../packet/SettingsCommandPacket';
import SettingsCommandHandler from './SettingsCommandHandler';

describe('SettingsCommandHandler', () => {
    it('dispatches the command line with the player as both sender and target', async () => {
        const dispatched: string[] = [];
        const player = stub<Player>({});
        const senders: unknown[] = [];
        const server = stub<Server>({
            getCommandManager: () =>
                stub<CommandManager>({
                    dispatchCommand: async (sender, target, input) => {
                        senders.push(sender, target);
                        dispatched.push(input ?? '');
                        return true;
                    }
                })
        });
        const session = stub<PlayerSession>({ getPlayer: () => player });
        const packet = Object.assign(new SettingsCommandPacket(), {
            command: '/gamerule showcoordinates true',
            suppressOutput: true
        });

        await new SettingsCommandHandler().handle(packet, server, session);

        expect(dispatched).toEqual(['/gamerule showcoordinates true']);
        expect(senders).toEqual([player, player]);
    });
});
