/**
 * What a server list shows of the server, whichever transport a client asks over: RakNet's
 * unconnected pong, NetherNet's join status and LAN advertisement, the query protocol and Java
 * Edition's status response. Every transport reads this one status, so a change shows on all of
 * them at once.
 */

/** The fields of the status that an owner, such as a behavior pack, may change. */
export interface ServerListFields {
    /** The MOTD, the first line a server list shows. */
    readonly motd: string;
    /**
     * The second name: the server name RakNet's pong carries after the counts, and NetherNet's
     * level name. The software name until something changes it, as other third-party servers
     * fill it.
     */
    readonly levelName: string;
    /** How many players the list says are online. */
    readonly onlinePlayers: number;
    /** How many players the list says may be online at once. */
    readonly maxPlayers: number;
}

/** Everything the status holds: the fields an owner may change, and what only the server sets. */
export interface ServerStatusSnapshot extends ServerListFields {
    /** The Bedrock protocol version the server advertises. */
    readonly protocol: number;
    /** The Minecraft Bedrock release the server advertises. */
    readonly version: string;
    /** The default game mode, as the config names it. */
    readonly gamemode: string;
}

/** Whether two snapshots show the same thing. */
const same = (a: ServerStatusSnapshot, b: ServerStatusSnapshot): boolean =>
    a.motd === b.motd &&
    a.levelName === b.levelName &&
    a.onlinePlayers === b.onlinePlayers &&
    a.maxPlayers === b.maxPlayers &&
    a.protocol === b.protocol &&
    a.version === b.version &&
    a.gamemode === b.gamemode;

/**
 * The server's status: what the server itself says, the base, under the changes owners layered
 * on it. Each owner keeps its own changes, and where two owners change one field the one that
 * changed it last shows. Clearing an owner's changes shows what is under them again.
 */
export class ServerStatus {
    private base: ServerStatusSnapshot;
    /** Each owner's changes, the owner that changed something last at the end. */
    private readonly overrides = new Map<object, Partial<ServerListFields>>();
    private shown: ServerStatusSnapshot;
    private readonly listeners = new Set<(status: ServerStatusSnapshot) => void>();

    /** @param base - What the server says before any owner changes it. */
    public constructor(base: ServerStatusSnapshot) {
        this.base = base;
        this.shown = base;
    }

    /** What a server list shows now. */
    public current(): ServerStatusSnapshot {
        return this.shown;
    }

    /** The MOTD shown now. */
    public getMotd(): string {
        return this.shown.motd;
    }

    /** The online player count shown now. */
    public getOnlinePlayerCount(): number {
        return this.shown.onlinePlayers;
    }

    /** The player limit shown now. */
    public getMaxPlayerCount(): number {
        return this.shown.maxPlayers;
    }

    /**
     * Changes what the server itself says, such as the online count as players come and go. An
     * owner's change of the same field still shows over it.
     * @param fields - The new values; a field left out keeps its value.
     */
    public setBase(fields: Partial<ServerStatusSnapshot>): void {
        this.base = { ...this.base, ...fields };
        this.refresh();
    }

    /**
     * Layers an owner's changes over the status. They merge with the owner's earlier ones, and
     * the owner's changes then show over every other owner's.
     * @param owner - Whoever makes the change, which {@link ServerStatus.clear} names again.
     * @param fields - The new values; a field left out keeps the owner's earlier value, or none.
     */
    public override(owner: object, fields: Partial<ServerListFields>): void {
        const earlier = this.overrides.get(owner);
        this.overrides.delete(owner);
        this.overrides.set(owner, { ...earlier, ...fields });
        this.refresh();
    }

    /**
     * Takes every change an owner made back, so what is under them shows again.
     * @param owner - The owner {@link ServerStatus.override} was given.
     */
    public clear(owner: object): void {
        if (this.overrides.delete(owner)) this.refresh();
    }

    /**
     * Hears of each change of what a server list shows.
     * @param listener - Called with the new status after each change.
     * @returns A function that stops listening.
     */
    public onChange(listener: (status: ServerStatusSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private refresh(): void {
        let next = this.base;
        for (const fields of this.overrides.values()) next = { ...next, ...fields };
        if (same(next, this.shown)) return;
        this.shown = next;
        for (const listener of [...this.listeners]) listener(next);
    }
}
