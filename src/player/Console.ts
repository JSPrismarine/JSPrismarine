import readline from 'readline';
import Player from ".";
import Chat from '../chat/Chat';
import ChatEvent from '../events/chat/ChatEvent';
import type Prismarine from "../Prismarine";
import type World from "../world/world";

export default class Console extends Player {
    constructor(server: Prismarine) {
        super(null, null, null as unknown as World, server);
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
                return (this.getServer().getCommandManager() as any).dispatchCommand(
                    this, input
                );

            const event = new ChatEvent(new Chat(this, `${this.getFormattedUsername()} ${input}`));
            return this.getServer().getEventManager().emit('chat', event);
        });
    }

    public sendMessage(message: string, xuid = '', needsTranslation = false) {
        this.getServer().getLogger().info(message);
    }

    public isPlayer() {
        return false;
    }
};
