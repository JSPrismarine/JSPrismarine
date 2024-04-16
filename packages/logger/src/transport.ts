import Transport from 'winston-transport';

export type ConsoleLike = {
    write: (input: string) => void;
};

export class PrismarineTransport extends Transport {
    public console: ConsoleLike | undefined;
    private buffer: any[] = [];

    log(info: any, next: () => void) {
        if (!this.console) {
            this.buffer.push(info);
            return next();
        }

        if (this.buffer.length > 0) {
            for (const message of this.buffer) {
                this.console.write(message[Symbol.for('message')]);
            }
            this.buffer = [];
        }

        this.console.write(info[Symbol.for('message')]);
        return next();
    }
}
