import { Gametype } from '@jsprismarine/minecraft';
import { PlayerActionStatus } from '@jsprismarine/protocol/java/packet/play';
import { describe, expect, it } from 'vitest';

import { isBlockStatus, javaDropIntentOf, javaMiningIntentOf } from './javaMining';

const dig = (status: PlayerActionStatus) => ({ status, position: { x: 1, y: -60, z: -2 }, face: 1, sequence: 4 });

describe('javaMiningIntentOf', () => {
    it('decodes a survival dig into server-timed steps that break an instant block on the start', () => {
        expect(javaMiningIntentOf(dig(PlayerActionStatus.StartDestroyBlock), Gametype.SURVIVAL)).toEqual({
            kind: 'mineBlock',
            step: 'start',
            position: { x: 1, y: -60, z: -2 },
            face: 1,
            serverTimed: true,
            breaksIfInstant: true
        });
        expect(javaMiningIntentOf(dig(PlayerActionStatus.AbortDestroyBlock), Gametype.SURVIVAL)?.step).toBe('abort');
        expect(javaMiningIntentOf(dig(PlayerActionStatus.StopDestroyBlock), Gametype.SURVIVAL)?.step).toBe('finish');
    });

    it("takes a creative player's start as the whole break", () => {
        expect(javaMiningIntentOf(dig(PlayerActionStatus.StartDestroyBlock), Gametype.CREATIVE)?.step).toBe('instant');
    });

    it('decodes no mining from a change of face or a hand action, and answers only the block statuses', () => {
        expect(javaMiningIntentOf(dig(PlayerActionStatus.ChangeDestroyDirection), Gametype.SURVIVAL)).toBeUndefined();
        expect(javaMiningIntentOf(dig(PlayerActionStatus.DropItem), Gametype.SURVIVAL)).toBeUndefined();
        expect(isBlockStatus(PlayerActionStatus.ChangeDestroyDirection)).toBe(true);
        expect(isBlockStatus(PlayerActionStatus.DropItem)).toBe(false);
    });

    it('decodes the drop key into a drop of one item, or with Ctrl of the stack', () => {
        expect(javaDropIntentOf(PlayerActionStatus.DropItem)).toEqual({ kind: 'dropHeldItem', all: false });
        expect(javaDropIntentOf(PlayerActionStatus.DropAllItems)).toEqual({ kind: 'dropHeldItem', all: true });
        expect(javaDropIntentOf(PlayerActionStatus.StartDestroyBlock)).toBeUndefined();
    });
});
