import { SetLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import SetLocalPlayerAsInitializedDecoder from './SetLocalPlayerAsInitializedDecoder';

describe('SetLocalPlayerAsInitializedDecoder', () => {
    it('decodes the notice whatever runtime id it carries, since it can only be about the sender', () => {
        const { view } = decodeView();

        expect(
            new SetLocalPlayerAsInitializedDecoder().decode(new SetLocalPlayerAsInitializedPacket(), view)
        ).toStrictEqual([{ kind: 'playerInitialized' }]);
    });
});
