import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import ActorEventDecoder from './ActorEventDecoder';

const event = (runtimeEntityId: bigint, kind: ActorEvent, data = 0) =>
    Object.assign(new ActorEventPacket(), { runtimeEntityId, event: kind, data });

describe('ActorEventDecoder', () => {
    it('decodes a FEED about the sender into an eat with the item it carries', () => {
        const { view, logged } = decodeView({ name: 'runner' });

        expect(new ActorEventDecoder().decode(event(7n, ActorEvent.FEED, 260), view)).toStrictEqual([
            { kind: 'eat', item: 260 }
        ]);
        expect(logged).toEqual([]);
    });

    it('drops an event that names another actor', () => {
        // A vanilla client echoes a FEED it was sent about somebody else, so this is logged
        // rather than treated as an attack. A modified client naming a mob lands here too.
        const { view, logged } = decodeView({ name: 'runner' });

        expect(new ActorEventDecoder().decode(event(8n, ActorEvent.FEED, 260), view)).toEqual([]);
        expect(logged).toEqual(['Dropped actor event 57 from runner: it names actor 8, not the sender']);
    });

    it('drops a server-only event, even about the sender', () => {
        const { view, logged } = decodeView({ name: 'runner' });

        expect(new ActorEventDecoder().decode(event(7n, ActorEvent.HURT_ANIMATION), view)).toEqual([]);
        expect(logged).toEqual(['Dropped actor event 2 from runner: a client does not send it']);
    });
});
