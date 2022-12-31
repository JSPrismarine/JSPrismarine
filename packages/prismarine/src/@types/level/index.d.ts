declare module 'level' {
    type Options = {
        keyEncoding?: string;
        valueEncoding?: string;
    }

    export default class Level {
        public constructor(path: string);

        public open(): Promise<void>;
        public open(callback: () => void): void;

        public close(): Promise<void>;
        public close(callback: () => void): void;

        public del(key: string): Promise<void>;
        public del(key: string, callback?: (err?: Error) => void): void;

        public get(key: string, options?: Options): Promise<any>;
        public get(key: string, options?: Options, callback?: (value: any) => void): void;

        public put(key: string, value: any, options?: Options): Promise<void>;
        public put(key: string, value: any, options?: Options, callback?: () => void): void;

        public batch(
            actions: Array<{
                type: string;
                key: string;
                value?: any;
            }>
        ): Promise<void>;
    }
}
