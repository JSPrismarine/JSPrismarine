import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import CommandExecuter from './command/CommandExecuter';
import type Server from './Server';
import readline from 'readline';

export default class Console implements CommandExecuter {
    private readonly server: Server;
    private cli: readline.Interface;

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

        this.cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '',
            completer: process.stdin.isTTY ? completer : undefined
        });

        this.cli.on('line', async (input: string) => {
            if (input.startsWith('/'))
                return this.getServer()
                    .getCommandManager()
                    .dispatchCommand(this, input.slice(1));

            const event = new ChatEvent(
                new Chat(this, `${this.getFormattedUsername()} ${input}`)
            );
            return this.getServer().getEventManager().emit('chat', event);
        });

        server.getEventManager().on('chat', async (evt: ChatEvent) => {
            if (evt.cancelled) return;

            if (
                evt.getChat().getChannel() === '*.everyone' ||
                evt.getChat().getChannel() === '*.ops' ||
                evt.getChat().getChannel() === `*.console`
            )
                await this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async onDisable(): Promise<void> {
        return new Promise((resolve) => {
            this.cli.on('close', () => {
                resolve();
            });
            this.cli.close();
        });
    }

    public getUsername(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    public async sendMessage(message: string): Promise<void> {
        this.getServer().getLogger().info(message, 'Console');
    }

    public getServer(): Server {
        return this.server;
    }

    public isPlayer(): boolean {
        return false;
    }

    public isOp(): boolean {
        return true;
    }
}
