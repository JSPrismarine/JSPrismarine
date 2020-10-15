const Command = require('./').default;

describe('command', () => {
    describe('command', () => {
        const command = new Command({
            id: 'test:test-plugin',
        });
        
        it('name & namespace should be set correctly', () => {
            expect(command.id).toBe('test:test-plugin');
        });
    });
});
