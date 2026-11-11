import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { StoreActor } from '../../entity/data/storeActors';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import InteractPacket, { InteractAction } from '@jsprismarine/protocol/packet/InteractPacket';
import InteractHandler from './InteractHandler';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';

const SELF = 7n;
const NPC = 20n;

/**
 * A survival player at the origin, with runtime id 7, in a world that may hold one other
 * actor `npcDistance` blocks along x.
 *
 * The session records inventory opens and every log line, so a packet the handler should
 * have refused shows up as a line that was logged rather than a window that opened.
 */
const fakeSession = (options: { npcDistance?: number; tracked?: boolean } = {}) => {
    const opened: number[] = [];
    const logged: string[] = [];

    // Annotated, because the entity the world answers with holds a position back into it.
    const world: World = stub<World>({
        getActor: (runtimeId) =>
            runtimeId === NPC && options.npcDistance !== undefined
                ? stub<StoreActor>({ getPosition: () => new Position(options.npcDistance ?? 0, 0, 0, world) })
                : null
    });
    const player = stubPlayerPort({
        gamemode: Gametype.SURVIVAL,
        getPosition: () => new Position(0, 0, 0, world)
    });
    const session = stub<PlayerSession>({
        runtimeId: SELF,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world,
        tracks: (runtimeId) => runtimeId === SELF || (runtimeId === NPC && options.tracked === true),
        openMainInventory: async () => {
            opened.push(1);
        }
    });
    const logger = stub<Logger>({
        debug: (...message) => void logged.push(message[0] ?? ''),
        verbose: (...message) => void logged.push(message[0] ?? '')
    });
    const { context, outputs, settled } = inputContext(session, { log: logger });

    return { opened, logged, context, outputs, settled };
};

const interact = (action: number, target: bigint): InteractPacket =>
    Object.assign(new InteractPacket(), { action, target });

describe('InteractHandler', () => {
    it('opens the inventory when the inventory button names the sender', async () => {
        const { opened, logged, context, outputs, settled } = fakeSession();

        new InteractHandler().handle(interact(InteractAction.OpenInventory, SELF), context);
        // The open's sends go to the input step rather than being awaited.
        expect(outputs).toHaveLength(1);
        await settled();

        expect(opened).toHaveLength(1);
        expect(logged).toEqual([]);
    });

    it('drops an inventory open that names another actor', async () => {
        const { opened, logged, context } = fakeSession();

        new InteractHandler().handle(interact(InteractAction.OpenInventory, 8n), context);

        expect(opened).toEqual([]);
        expect(logged).toEqual(['Dropped an inventory open from tester: it names actor 8, not themselves']);
    });

    it('ignores a mouse over and a dismount without logging or opening anything', async () => {
        const { opened, logged, context } = fakeSession();
        const handler = new InteractHandler();

        handler.handle(interact(InteractAction.InteractUpdate, 8n), context);
        handler.handle(interact(InteractAction.StopRiding, 8n), context);

        expect(opened).toEqual([]);
        expect(logged).toEqual([]);
    });

    it('drops an NPC open for an actor the client has not been shown', async () => {
        const { logged, context } = fakeSession({ npcDistance: 1, tracked: false });

        new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), context);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is not one they have been shown`]);
    });

    it('drops an NPC open for an actor that is not in the world', async () => {
        const { logged, context } = fakeSession({ tracked: true });

        new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), context);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is not one they have been shown`]);
    });

    it('drops an NPC open for an actor out of reach', async () => {
        const { logged, context } = fakeSession({ npcDistance: 10, tracked: true });

        new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), context);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is 10.0 away`]);
    });

    it('records an NPC open within reach as unimplemented', async () => {
        const { logged, context } = fakeSession({ npcDistance: 2, tracked: true });

        new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), context);

        expect(logged).toEqual([`tester opened NPC ${NPC}. NPC dialogue is not implemented`]);
    });

    it('logs an action no client sends and does not throw', async () => {
        const { opened, logged, context } = fakeSession();

        new InteractHandler().handle(interact(99, SELF), context);

        expect(opened).toEqual([]);
        expect(logged).toEqual(['Dropped interact action 99 from tester: not one a client sends']);
    });
});
