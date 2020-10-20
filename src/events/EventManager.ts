import { Evt, to } from 'evt';
import type Player from '../player';
import type Prismarine from '../Prismarine';

export default class EventManager extends Evt<
    ['playerConnect', Player] |
    ['playerDisconnect', Player] |
    ['playerSpawn', Player] |
    ['playerDespawn', Player] |
    ['playerMove', Player]
    > {
    constructor(server: Prismarine) {
        super();
    }

    public on(id: string, callback: any) {
        return this.$attach(to(id as any), callback);
    }
};
