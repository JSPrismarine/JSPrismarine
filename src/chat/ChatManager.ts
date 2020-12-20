import Chat from './Chat';
import ChatEvent from '../events/chat/ChatEvent';
import type Prismarine from '../Prismarine';

export default class ChatManager {
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;
    }

    public send(chat: Chat) {
        const event = new ChatEvent(chat);
        this.server.getEventManager().emit('chat', event);
    }
}
