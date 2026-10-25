import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Entity } from '../../entity/Entity';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import InteractPacket, { InteractAction } from '../packet/InteractPacket';
import InteractHandler from './InteractHandler';

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
        getEntity: (runtimeId) =>
            runtimeId === NPC && options.npcDistance !== undefined
                ? stub<Entity>({ getPosition: () => new Position(options.npcDistance ?? 0, 0, 0, world) })
                : null
    });
    const player = stub<Player>({
        gamemode: Gametype.SURVIVAL,
        getName: () => 'tester',
        getRuntimeId: () => SELF,
        getPosition: () => new Position(0, 0, 0, world),
        getWorld: () => world
    });
    const session = stub<PlayerSession>({
        getPlayer: () => player,
        tracks: (runtimeId) => runtimeId === SELF || (runtimeId === NPC && options.tracked === true),
        openMainInventory: async () => {
            opened.push(1);
        }
    });
    const logger = stub<Logger>({
        debug: (...message) => void logged.push(message[0] ?? ''),
        verbose: (...message) => void logged.push(message[0] ?? '')
    });
    const server = stub<Server>({ getLogger: () => logger });

    return { opened, logged, server, session };
};

const interact = (action: number, target: bigint): InteractPacket =>
    Object.assign(new InteractPacket(), { action, target });

describe('InteractHandler', () => {
    it('opens the inventory when the inventory button names the sender', async () => {
        const { opened, logged, server, session } = fakeSession();

        await new InteractHandler().handle(interact(InteractAction.OpenInventory, SELF), server, session);

        expect(opened).toHaveLength(1);
        expect(logged).toEqual([]);
    });

    it('drops an inventory open that names another actor', async () => {
        const { opened, logged, server, session } = fakeSession();

        await new InteractHandler().handle(interact(InteractAction.OpenInventory, 8n), server, session);

        expect(opened).toEqual([]);
        expect(logged).toEqual(['Dropped an inventory open from tester: it names actor 8, not themselves']);
    });

    it('ignores a mouse over and a dismount without logging or opening anything', async () => {
        const { opened, logged, server, session } = fakeSession();
        const handler = new InteractHandler();

        await handler.handle(interact(InteractAction.InteractUpdate, 8n), server, session);
        await handler.handle(interact(InteractAction.StopRiding, 8n), server, session);

        expect(opened).toEqual([]);
        expect(logged).toEqual([]);
    });

    it('drops an NPC open for an actor the client has not been shown', async () => {
        const { logged, server, session } = fakeSession({ npcDistance: 1, tracked: false });

        await new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), server, session);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is not one they have been shown`]);
    });

    it('drops an NPC open for an actor that is not in the world', async () => {
        const { logged, server, session } = fakeSession({ tracked: true });

        await new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), server, session);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is not one they have been shown`]);
    });

    it('drops an NPC open for an actor out of reach', async () => {
        const { logged, server, session } = fakeSession({ npcDistance: 10, tracked: true });

        await new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), server, session);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is 10.0 away`]);
    });

    it('records an NPC open within reach as unimplemented', async () => {
        const { logged, server, session } = fakeSession({ npcDistance: 2, tracked: true });

        await new InteractHandler().handle(interact(InteractAction.NpcOpen, NPC), server, session);

        expect(logged).toEqual([`tester opened NPC ${NPC}. NPC dialogue is not implemented`]);
    });

    it('logs an action no client sends and does not throw', async () => {
        const { opened, logged, server, session } = fakeSession();

        await new InteractHandler().handle(interact(99, SELF), server, session);

        expect(opened).toEqual([]);
        expect(logged).toEqual(['Dropped interact action 99 from tester: not one a client sends']);
    });
});
