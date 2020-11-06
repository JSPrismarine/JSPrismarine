import type Prismarine from '../../../../Prismarine';

export default class PlayerManager {
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;
    }
}
