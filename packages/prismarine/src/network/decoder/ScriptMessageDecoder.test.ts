import ScriptMessagePacket from '@jsprismarine/protocol/bedrock/packet/ScriptMessagePacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../testing/decodeView.test-utils';
import ScriptMessageDecoder from './ScriptMessageDecoder';

describe('ScriptMessageDecoder', () => {
    it('decodes the message id and value', () => {
        const { view } = decodeView();
        const packet = new ScriptMessagePacket({ messageId: 'hud:score', messageValue: '42' });

        expect(new ScriptMessageDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'scriptMessage', id: 'hud:score', value: '42' }
        ]);
    });
});
