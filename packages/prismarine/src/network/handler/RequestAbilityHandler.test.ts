import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import RequestAbilityPacket, { RequestAbilityValueType } from '../packet/RequestAbilityPacket';
import RequestAbilityHandler from './RequestAbilityHandler';

describe('RequestAbilityHandler', () => {
    it('logs the ability and the requested value', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new RequestAbilityPacket(), {
            ability: AbilityLayerFlag.FLYING,
            valueType: RequestAbilityValueType.Bool,
            boolValue: true
        });

        new RequestAbilityHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve asked to set ability FLYING to true. Abilities are not modeled, so nothing changed'
        ]);
    });
});
