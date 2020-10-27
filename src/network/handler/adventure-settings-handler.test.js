<<<<<<< HEAD
import Handler from './adventure-settings-handler';
import { AdventureSettingsPacket } from '../Identifiers';
=======
const Handler = require('./adventure-settings-handler');
const Identifiers = require('../Identifiers').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e

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
