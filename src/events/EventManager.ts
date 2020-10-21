import { Evt, to } from 'evt';
import type Player from '../player';
import type Prismarine from '../Prismarine';
import type ChatEvent from './chat/ChatEvent';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent';

export default class EventManager extends Evt<
    ['chat', ChatEvent] |
    ['playerConnect', Player] |
    ['playerDisconnect', Player] |
    ['playerSpawn', PlayerSpawnEvent] |
    ['playerDespawn', Player] |
    ['playerMove', Player]
    > {
    constructor(server: Prismarine) {
        super();
    }

    public async on(id: string, callback: any) {
        return await this.$attach(to(id as any), callback);
    }
};
