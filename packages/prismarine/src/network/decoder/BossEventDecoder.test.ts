import BossEventPacket, { BossEventUpdateType } from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../testing/decodeView.test-utils';
import BossEventDecoder from './BossEventDecoder';

const event = (eventType: BossEventUpdateType, targetActorId = 42n): BossEventPacket =>
    Object.assign(new BossEventPacket(), { targetActorId, eventType });

describe('BossEventDecoder', () => {
    it('decodes a query into the bar it asks about', () => {
        const { view } = decodeView();

        expect(new BossEventDecoder().decode(event(BossEventUpdateType.Query), view)).toStrictEqual([
            { kind: 'queryBossBar', actor: 42n }
        ]);
    });

    it('drops every other update type, which only the server sends', () => {
        const { view, logged } = decodeView();
        const decoder = new BossEventDecoder();

        expect(decoder.decode(event(BossEventUpdateType.Add), view)).toEqual([]);
        expect(decoder.decode(event(BossEventUpdateType.Remove), view)).toEqual([]);
        expect(logged).toEqual([]);
    });

    it('declares a read-lane intent only', () => {
        expect(new BossEventDecoder().intents).toEqual(['queryBossBar']);
    });
});
