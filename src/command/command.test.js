const Command = require('./command')

describe('command', () => {
    describe('command', () => {
        const command = new Command({
            namespace: 'test',
            name: 'test-plugin'
        })
        
        it('name & namespace should be set correctly', () => {
            expect(command.namespace === 'test')
            expect(command.name === 'test-plugin')
            expect(command.description === '')
        })
    })
})
