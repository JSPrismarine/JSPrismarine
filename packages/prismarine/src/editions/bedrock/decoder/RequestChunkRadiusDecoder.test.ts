import { RequestChunkRadiusPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import RequestChunkRadiusDecoder from './RequestChunkRadiusDecoder';

describe('RequestChunkRadiusDecoder', () => {
    it('decodes the requested radius and the client maximum as they came', () => {
        const { view } = decodeView();

        expect(
            new RequestChunkRadiusDecoder().decode(new RequestChunkRadiusPacket({ radius: 10, maxRadius: 6 }), view)
        ).toStrictEqual([{ kind: 'setViewDistance', radius: 10, maxRadius: 6 }]);
    });

    it('throws for a packet with no decoded body', () => {
        const { view } = decodeView();

        expect(() => new RequestChunkRadiusDecoder().decode(new RequestChunkRadiusPacket(), view)).toThrow();
    });
});
