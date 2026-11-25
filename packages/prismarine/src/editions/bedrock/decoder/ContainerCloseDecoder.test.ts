import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import ContainerCloseDecoder from './ContainerCloseDecoder';

describe('ContainerCloseDecoder', () => {
    it('decodes the window id and container type, and ignores the server-initiated claim', () => {
        const { view } = decodeView();
        const packet = Object.assign(new ContainerClosePacket(), {
            containerId: 3,
            containerType: 0,
            serverInitiatedClose: true
        });

        expect(new ContainerCloseDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'closeContainer', window: 3, containerType: 0 }
        ]);
    });
});
