import InteractPacket, { InteractAction } from '@jsprismarine/protocol/bedrock/packet/InteractPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import InteractDecoder from './InteractDecoder';

const SELF = 7n;
const NPC = 20n;

const interact = (action: number, target: bigint): InteractPacket =>
    Object.assign(new InteractPacket(), { action, target });

describe('InteractDecoder', () => {
    it('decodes the inventory button naming the sender into an inventory open', () => {
        const { view, logged } = decodeView();

        expect(new InteractDecoder().decode(interact(InteractAction.OpenInventory, SELF), view)).toStrictEqual([
            { kind: 'openInventory' }
        ]);
        expect(logged).toEqual([]);
    });

    it('drops an inventory open that names another actor', () => {
        const { view, logged } = decodeView();

        expect(new InteractDecoder().decode(interact(InteractAction.OpenInventory, 8n), view)).toEqual([]);
        expect(logged).toEqual(['Dropped an inventory open from tester: it names actor 8, not themselves']);
    });

    it('ignores a mouse over and a dismount without logging anything', () => {
        const { view, logged } = decodeView();
        const decoder = new InteractDecoder();

        expect(decoder.decode(interact(InteractAction.InteractUpdate, 8n), view)).toEqual([]);
        expect(decoder.decode(interact(InteractAction.StopRiding, 8n), view)).toEqual([]);
        expect(logged).toEqual([]);
    });

    it('decodes an NPC open for an actor the client has been shown, leaving reach to the world', () => {
        const { view } = decodeView({ tracked: [NPC] });

        expect(new InteractDecoder().decode(interact(InteractAction.NpcOpen, NPC), view)).toStrictEqual([
            { kind: 'openNpc', target: NPC }
        ]);
    });

    it('drops an NPC open for an actor the client has not been shown', () => {
        const { view, logged } = decodeView();

        expect(new InteractDecoder().decode(interact(InteractAction.NpcOpen, NPC), view)).toEqual([]);
        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is not one they have been shown`]);
    });

    it('logs an action no client sends and decodes nothing', () => {
        const { view, logged } = decodeView();

        expect(new InteractDecoder().decode(interact(99, SELF), view)).toEqual([]);
        expect(logged).toEqual(['Dropped interact action 99 from tester: not one a client sends']);
    });

    it('declares the kinds it returns, so its handler runs in the input lane', () => {
        expect([...new InteractDecoder().intents].sort()).toEqual(['openInventory', 'openNpc']);
    });
});
