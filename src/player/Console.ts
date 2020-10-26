import readline from 'readline';
import Player from ".";
import Chat from '../chat/Chat';
import ChatEvent from '../events/chat/ChatEvent';
import type Prismarine from "../Prismarine";
import type World from "../world/world";

export default class Console extends Player {
    private server: Prismarine;

    constructor(server: Prismarine) {
        super(null, null, null as unknown as World, server);
        this.server = server;
        this.username = {
            prefix: '[',
            suffix: ']',
            name: 'CONSOLE'
        };

        // Console command reader
        process.stdin.setEncoding('utf8');
        let rl = readline.createInterface({ input: process.stdin });
        rl.on('line', (input: string) => {
            if ((input.startsWith('/')))
                return (this.server.getCommandManager() as any).dispatchCommand(
                    this, input
                );

            const event = new ChatEvent(new Chat(this, input));
            return this.server.getEventManager().emit('chat', event);
        });
    }

    public sendMessage(message: string, xuid = '', needsTranslation = false) {
        this.server.getLogger().info(message);
    }
};
