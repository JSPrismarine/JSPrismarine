const Command = require('./command').default;

describe('command', () => {
    describe('command', () => {
        const command = new Command({
            namespace: 'test',
            name: 'test-plugin'
        });
        
        it('name & namespace should be set correctly', () => {
            expect(command.namespace).toBe('test');
            expect(command.name).toBe('test-plugin');
            expect(command.description).toBe('');
        });
    });
});
