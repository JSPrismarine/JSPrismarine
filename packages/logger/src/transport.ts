import Transport from 'winston-transport';

export type ConsoleLike = {
    write: (input: string) => void;
};

export class PrismarineTransport extends Transport {
    public console: ConsoleLike | undefined;
    private buffer: any[] = [];

    public log(info: any, next: () => void): any {
        if (!this.console) {
            this.buffer.push(info);

            return next();
        }

        try {
            if (this.buffer.length > 0) {
                for (const message of this.buffer) {
                    this.console.write(message[Symbol.for('message')]);
                }
                this.buffer = [];
            }

            this.console.write(info[Symbol.for('message')]);
        } catch {}

        return next();
    }
}
