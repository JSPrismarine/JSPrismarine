import Command from './VersionCommand';

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
