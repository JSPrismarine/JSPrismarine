import ActorPickRequestPacket from '@jsprismarine/protocol/bedrock/packet/ActorPickRequestPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import ActorPickRequestDecoder from './ActorPickRequestDecoder';

describe('ActorPickRequestDecoder', () => {
    it('decodes the picked actor, by the unique id that is its runtime id, and the data flag', () => {
        const { view } = decodeView();
        const packet = Object.assign(new ActorPickRequestPacket(), { actorId: 12n, maxSlots: 0, withData: true });

        expect(new ActorPickRequestDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'pickEntity', target: 12n, withData: true }
        ]);
    });
});
