import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import CommandExecuter from './command/CommandExecuter';
import type Server from './Server';
import readline from 'readline';

export default class Console implements CommandExecuter {
    private server: Server;

    public constructor(server: Server) {
        this.server = server;

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

        server.getEventManager().on('chat', (evt: ChatEvent) => {
            if (evt.cancelled) return;

            if (
                evt.getChat().getChannel() === '*.everyone' ??
                evt.getChat().getChannel() === '*.ops' ??
                evt.getChat().getChannel() === `*.player.${this.getUsername()}`
            )
                this.sendMessage(evt.getChat().getMessage());
        });
    }

    public getUsername(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    public sendMessage(message: string): void {
        this.getServer().getLogger().info(message);
    }

    public getServer(): Server {
        return this.server;
    }

    public isPlayer(): boolean {
        return false;
    }
}
