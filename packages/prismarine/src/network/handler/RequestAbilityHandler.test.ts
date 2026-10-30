import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import RequestAbilityPacket, { RequestAbilityValueType } from '@jsprismarine/protocol/packet/RequestAbilityPacket';
import RequestAbilityHandler from './RequestAbilityHandler';

/**
 * The client expects an `UpdateAbilitiesPacket` after every request: the new state when the
 * change went through, the old one when it did not. `Player.setFlying` sends the former
 * itself, so the handler only has to send the latter.
 */
const fakeSession = ({ flying = false, canFly = true }: { flying?: boolean; canFly?: boolean } = {}) => {
    const requested: boolean[] = [];
    const resent: Array<Player | undefined> = [];
    const logged: string[] = [];
    let isFlying = flying;
    const player = stub<Player>({
        getName: () => 'Steve',
        isFlying: () => isFlying,
        setFlying: async (value) => {
            requested.push(value);
            if (canFly) isFlying = value;
        }
    });

    return {
        requested,
        resent,
        logged,
        server: stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        }),
        session: stub<PlayerSession>({
            getPlayer: () => player,
            sendAbilities: async (target) => void resent.push(target)
        })
    };
};

const request = (ability: AbilityLayerFlag, valueType: RequestAbilityValueType, value: boolean | number) =>
    Object.assign(new RequestAbilityPacket(), {
        ability,
        valueType,
        ...(typeof value === 'boolean' ? { boolValue: value } : { floatValue: value })
    });

describe('RequestAbilityHandler', () => {
    it('applies a flight toggle and leaves the broadcast to the player', async () => {
        const { requested, resent, server, session } = fakeSession();

        await new RequestAbilityHandler().handle(
            request(AbilityLayerFlag.FLYING, RequestAbilityValueType.Bool, true),
            server,
            session
        );

        expect(requested).toEqual([true]);
        expect(resent).toEqual([]);
    });

    it('sends the abilities back when flight was refused', async () => {
        const { requested, resent, server, session } = fakeSession({ canFly: false });

        await new RequestAbilityHandler().handle(
            request(AbilityLayerFlag.FLYING, RequestAbilityValueType.Bool, true),
            server,
            session
        );

        expect(requested).toEqual([true]);
        expect(resent).toEqual([undefined]);
    });

    it('sends the abilities back when the client asks for the state the server holds', async () => {
        const { resent, server, session } = fakeSession({ flying: true });

        await new RequestAbilityHandler().handle(
            request(AbilityLayerFlag.FLYING, RequestAbilityValueType.Bool, true),
            server,
            session
        );

        expect(resent).toEqual([undefined]);
    });

    it('refuses any other ability by logging it and resending the abilities', async () => {
        const { requested, resent, logged, server, session } = fakeSession();

        await new RequestAbilityHandler().handle(
            request(AbilityLayerFlag.FLY_SPEED, RequestAbilityValueType.Float, 0.5),
            server,
            session
        );

        expect(requested).toEqual([]);
        expect(resent).toEqual([undefined]);
        expect(logged).toEqual([
            'Steve asked to set ability FLY_SPEED to 0.5. Only flight can be requested, so the current abilities were sent back'
        ]);
    });

    it('does not treat a float-typed flying request as a toggle', async () => {
        const { requested, resent, server, session } = fakeSession();

        await new RequestAbilityHandler().handle(
            request(AbilityLayerFlag.FLYING, RequestAbilityValueType.Float, 1),
            server,
            session
        );

        expect(requested).toEqual([]);
        expect(resent).toEqual([undefined]);
    });
});
