import SettingsCommandPacket from '@jsprismarine/protocol/bedrock/packet/SettingsCommandPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import SettingsCommandDecoder from './SettingsCommandDecoder';

describe('SettingsCommandDecoder', () => {
    it('decodes the command line and leaves the suppress flag behind', () => {
        const { view } = decodeView();
        const packet = new SettingsCommandPacket({ command: '/gamerule showcoordinates true', suppressOutput: true });

        expect(new SettingsCommandDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'runCommand', command: '/gamerule showcoordinates true' }
        ]);
    });
});
