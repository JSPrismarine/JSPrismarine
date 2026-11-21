import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { ShownPlayer } from '../../world/ShownPlayer';
import type PlayerSession from '../../network/PlayerSession';
import type { Intent } from '../Intent';
import RequestAbilityHandler from './RequestAbilityHandler';

/**
 * The client expects an `UpdateAbilitiesPacket` after every request: the new state when the
 * change went through, the old one when it did not. `PlayerSession.setFlying` sends the former
 * itself, so the handler only has to send the latter.
 */
const fakeSession = ({ flying = false, canFly = true }: { flying?: boolean; canFly?: boolean } = {}) => {
    const requested: boolean[] = [];
    const resent: Array<ShownPlayer | undefined> = [];
    const logged: string[] = [];
    let isFlying = flying;
    const player = stubPlayerPort({ isFlying: () => isFlying });

    const session = stub<PlayerSession>({
        identity: identityNamed('Steve'),
        getPlayer: () => player,
        setFlying: async (value: boolean) => {
            requested.push(value);
            if (canFly) isFlying = value;
        },
        sendAbilities: async (target) => void resent.push(target)
    });
    const log = stub<Logger>({ debug: (...message) => void logged.push(String(message[0] ?? '')) });
    const { context, outputs, settled } = inputContext(session, { log });

    return { requested, resent, logged, context, outputs, settled, isFlying: () => isFlying };
};

const fly = (value: boolean | number): Intent<'requestAbility'> => ({
    kind: 'requestAbility',
    ability: 'FLYING',
    value
});

describe('input/handlers/RequestAbilityHandler', () => {
    it('writes the flight state before it returns, and leaves only the sends to the step', () => {
        const { requested, isFlying, context, outputs } = fakeSession();

        new RequestAbilityHandler().handle(fly(true), context);

        expect(requested).toEqual([true]);
        expect(isFlying()).toBe(true);
        expect(outputs).toHaveLength(1);
    });

    it("throws out of the handler when the flight event's listener throws, so its unit is undone", () => {
        const { context, outputs } = fakeSession();
        const session = stub<PlayerSession>({
            identity: identityNamed('Steve'),
            getPlayer: () => stubPlayerPort({ isFlying: () => false }),
            setFlying: () => {
                throw new Error('a listener failed');
            }
        });

        expect(() => new RequestAbilityHandler().handle(fly(true), { ...context, session })).toThrow(
            'a listener failed'
        );
        expect(outputs).toEqual([]);
    });

    it('applies a flight toggle and leaves the broadcast to the player', async () => {
        const { requested, resent, context, settled } = fakeSession();

        new RequestAbilityHandler().handle(fly(true), context);
        await settled();

        expect(requested).toEqual([true]);
        expect(resent).toEqual([]);
    });

    it('sends the abilities back when flight was refused', async () => {
        const { requested, resent, context, settled } = fakeSession({ canFly: false });

        new RequestAbilityHandler().handle(fly(true), context);
        await settled();

        expect(requested).toEqual([true]);
        expect(resent).toEqual([undefined]);
    });

    it('sends the abilities back when the client asks for the state the server holds', async () => {
        const { resent, context, settled } = fakeSession({ flying: true });

        new RequestAbilityHandler().handle(fly(true), context);
        await settled();

        expect(resent).toEqual([undefined]);
    });

    it('refuses any other ability by logging it and resending the abilities', async () => {
        const { requested, resent, logged, context, settled } = fakeSession();

        new RequestAbilityHandler().handle({ kind: 'requestAbility', ability: 'FLY_SPEED', value: 0.5 }, context);
        await settled();

        expect(requested).toEqual([]);
        expect(resent).toEqual([undefined]);
        expect(logged).toEqual([
            'Steve asked to set ability FLY_SPEED to 0.5. Only flight can be requested, so the current abilities were sent back'
        ]);
    });

    it('does not treat a numeric flying value as a toggle', async () => {
        const { requested, resent, context, settled } = fakeSession();

        new RequestAbilityHandler().handle(fly(1), context);
        await settled();

        expect(requested).toEqual([]);
        expect(resent).toEqual([undefined]);
    });
});
