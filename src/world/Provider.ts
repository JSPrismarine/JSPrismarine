import { existsSync, mkdirSync } from 'fs';

class Provider {
    #path: string;

    public constructor(path: string) {
        this.#path = path;
        if (!(existsSync(path))) {
            mkdirSync(path);
        }
    }

    public get path() {
        return this.#path;
    }

}
export default Provider;