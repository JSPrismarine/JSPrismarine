import type Chat from '../../chat/Chat';
import Event from '../Event';

export default class ChatEvent extends Event {
    private chat;

    constructor(chat: Chat) {
        super();
        this.chat = chat;
    }

    getChat(): Chat {
        return this.chat;
    }
}
