const Command = require('./VersionCommand').default;
const packageFile = require('../../../package.json');
const identifiers = require('../../network/identifiers');

describe('command', () => {
    describe('jsprismarine', () => {
        describe('VersionCommand', () => {
            const command = new Command();

            it('name & namespace should be set correctly', () => {
                expect(command.id).toBe('jsprismarine:version');
            });

            it('version command should return correct version', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message).toBe(`This server is running on JSPrismarine ${packageFile.version} for Minecraft: Bedrock Edition v${identifiers.MinecraftVersion} (protocol version ${identifiers.Protocol})`);
                        done();
                    }
                }, []);
            });
        });
    });
});
