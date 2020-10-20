import Handler from './adventure-settings-handler';
import { AdventureSettingsPacket } from '../Identifiers';

describe('network', () => {
    describe('handler', () => {
        describe('adventure-settings-handler', () => {
            const handler = new Handler();

            it.skip('packet id should match', () => {
                expect(handler.NetID).toBe(AdventureSettingsPacket);
            });
        });
    });
});
