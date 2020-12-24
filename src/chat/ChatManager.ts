import Chat from './Chat';
import ChatEvent from '../events/chat/ChatEvent';
import type Server from '../Server';

export default class ChatManager {
    private server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    public send(chat: Chat) {
        const event = new ChatEvent(chat);
        this.server.getEventManager().emit('chat', event);
    }
}
