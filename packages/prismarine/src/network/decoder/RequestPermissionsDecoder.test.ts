import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import RequestPermissionsPacket from '@jsprismarine/protocol/bedrock/packet/RequestPermissionsPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../testing/decodeView.test-utils';
import RequestPermissionsDecoder from './RequestPermissionsDecoder';

describe('RequestPermissionsDecoder', () => {
    it('decodes the target, the level and the custom flags', () => {
        const { view } = decodeView();
        const packet = Object.assign(new RequestPermissionsPacket(), {
            targetPlayerUniqueId: 7n,
            playerPermissionLevel: PlayerPermissionLevel.CUSTOM,
            customPermissionFlags: 0xff
        });

        expect(new RequestPermissionsDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'setPlayerPermission', target: 7n, level: PlayerPermissionLevel.CUSTOM, customFlags: 0xff }
        ]);
    });
});
