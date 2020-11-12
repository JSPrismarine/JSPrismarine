import readline from 'readline';
import Player from './Player';
import Chat from '../chat/Chat';
import ChatEvent from '../events/chat/ChatEvent';
import type Prismarine from '../Prismarine';
import type World from '../world/World';

export default class Console extends Player {
    constructor(server: Prismarine) {
        super(null, null, (null as unknown) as World, server);
        this.username = {
            prefix: '[',
            suffix: ']',
            name: 'CONSOLE'
        };

        // Console command reader
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setEncoding('utf8');
        if (process.stdin.isTTY) process.stdin.setRawMode(true);

        const completer = (line: string) => {
            const hits = Array.from(
                this.getServer().getCommandManager().getCommands().values()
            )
                .filter((a) =>
                    a.id.split(':')[1].startsWith(line.replace('/', ''))
                )
                .map((a) => '/' + a.id.split(':')[1]);
            return [
                hits.length
                    ? hits
                    : Array.from(
                          this.getServer()
                              .getCommandManager()
                              .getCommands()
                              .values()
                      ).map((a) => '/' + a.id.split(':')[1]),
                line
            ];
        };

        const cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '',
            completer: process.stdin.isTTY ? completer : undefined
        });

        cli.on('line', (input: string) => {
            if (input.startsWith('/'))
                return this.getServer()
                    .getCommandManager()
                    .dispatchCommand(this, input);

            const event = new ChatEvent(
                new Chat(this, `${this.getFormattedUsername()} ${input}`)
            );
            return this.getServer().getEventManager().emit('chat', event);
        });
    }

    public sendMessage(message: string, xuid = '', needsTranslation = false) {
        this.getServer().getLogger().info(message);
    }

    public isPlayer() {
        return false;
    }
}
