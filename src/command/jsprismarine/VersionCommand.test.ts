const Command = require('./VersionCommand').default;
const packageFile = require('../../../package.json');
<<<<<<< HEAD
const identifiers = require('../../network/Identifiers');
=======
const identifiers = require('../../network/Identifiers').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e

describe('command', () => {
    describe('jsprismarine', () => {
        describe('VersionCommand', () => {
            const command = new Command();

            it('name & namespace should be set correctly', () => {
                expect(command.id).toBe('jsprismarine:version');
            });
        });
    });
});
