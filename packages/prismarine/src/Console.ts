import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import { Server } from './Prismarine';
import readline from 'readline';

export default class Console {
    private cli: readline.Interface;

    public constructor(private readonly server: Server) {
        // Console command reader
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setEncoding('utf8');

        try {
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
        } catch (error) {
            this.server.getLogger()?.warn(`Failed to enable stdin rawMode: ${error}!`);
            this.server.getLogger()?.debug((error as any).stack);
        }

        const completer = (line: string) => {
            const hits = Array.from(this.server.getCommandManager().getCommands().values())
                .filter((a) => a.id.split(':')[1].startsWith(line.replace('/', '')))
                .map((a) => '/' + a.id.split(':')[1]);
            return [
                hits.length
                    ? hits
                    : Array.from(this.server.getCommandManager().getCommands().values()).map(
                          (a) => '/' + a.id.split(':')[1]
                      ),
                line
            ];
        };

        this.cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '',
            crlfDelay: Number.POSITIVE_INFINITY,
            escapeCodeTimeout: 1500,
            completer: process.stdin.isTTY ? completer : undefined
        });

        this.cli.on('line', (input: string) => {
            if (input.startsWith('/')) {
                void this.server.getCommandManager().dispatchCommand(this as any, this as any, input.slice(1));
                return;
            }

            const event = new ChatEvent(new Chat(this, `[CONSOLE] ${input}`));
            void this.server.getEventManager().emit('chat', event);
        });

        server.getEventManager().on('chat', async (evt: ChatEvent) => {
            if (evt.cancelled) return;
            await this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async onDisable(): Promise<void> {
        this.cli.close();
    }

    public async sendMessage(message: string): Promise<void> {
        this.server.getLogger()?.info(message, 'Console');
    }
}
