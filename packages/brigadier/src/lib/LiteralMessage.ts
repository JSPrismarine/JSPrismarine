import type Message from './Message';

export default class LiteralMessage implements Message {
    private str: string;

    public constructor(str: string) {
        this.str = str;
    }

    public getString(): string {
        return this.str;
    }

    public toString(): string {
        return this.str;
    }
}
