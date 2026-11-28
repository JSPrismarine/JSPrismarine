import { describe, expect, it } from 'vitest';

import type { ExchangedPacket } from './exchange';
import { exchangeDifferences } from './exchange';

const packet = (name: string, fields: Record<string, unknown> = {}): ExchangedPacket => ({ name, fields });

describe('exchangeDifferences', () => {
    it('finds none in the same packets with the same fields', () => {
        const sent = [packet('ContainerOpenPacket', { windowId: 2 }), packet('InventoryContentPacket')];

        expect(exchangeDifferences(sent, sent)).toEqual([]);
    });

    it('names an extra packet once and still compares the packets after it', () => {
        const capture = [packet('ChangeDimensionPacket'), packet('SetHealthPacket', { health: 20 })];
        const replay = [
            packet('ChangeDimensionPacket'),
            packet('PlayStatusPacket'),
            packet('SetHealthPacket', { health: 10 })
        ];

        expect(exchangeDifferences(capture, replay)).toEqual([
            'packet 2 is an extra PlayStatusPacket',
            "SetHealthPacket's health is 10 where BDS sends 20"
        ]);
    });

    it('reports a missing packet after a field difference, so neither hides the other', () => {
        const capture = [
            packet('InventoryContentPacket', { containerId: 0 }),
            packet('ContainerOpenPacket', { windowId: 2 })
        ];
        const replay = [packet('InventoryContentPacket', { containerId: 7 })];

        expect(exchangeDifferences(capture, replay)).toEqual([
            "InventoryContentPacket's containerId is 7 where BDS sends 0",
            "BDS's packet 2, ContainerOpenPacket, is never sent"
        ]);
    });
});
