// A pack script as an author writes it against the built declarations. `pnpm run typecheck`
// compiles it, so a declaration that stops matching this use fails the check.

const load = async () => {
    try {
        return await import('@jsprismarine/server');
    } catch {
        return undefined;
    }
};

const jsp = await load();
if (jsp !== undefined) {
    const { jsprismarine } = jsp;
    const name: 'JSPrismarine' = jsprismarine.name;
    const protocol: number = jsprismarine.protocolVersion;
    const versions: string[] = [jsprismarine.version, jsprismarine.minecraftVersion];
    // @ts-expect-error The module's values are read-only.
    jsprismarine.version = '1.0.0';
    void [name, protocol, versions];

    // A server older than these members leaves them out, so the pack checks before it uses them.
    if ('performance' in jsp && 'getPing' in jsp && 'bossBars' in jsp) {
        const { performance, getPing, bossBars } = jsp;
        const tps: number = performance.tps;
        const averages: readonly number[] = performance.tpsAverages;
        const milliseconds: number[] = [performance.lastTickMs, performance.averageTickMs];
        // A Player of @minecraft/server fits, since the module names only what it reads.
        const player = { id: '-4294967295', name: 'Steve', isOp: () => false };
        const ping: number | undefined = getPing(player);
        const bar = bossBars.show(player, { text: `TPS: ${tps}`, progress: 0.5, color: 'green' });
        bar.update({ color: 'red' });
        if (bar.isValid) bar.hide();
        // @ts-expect-error A color the module does not name.
        bar.update({ color: 'gold' });
        // @ts-expect-error The list is read-only.
        averages.push(20);
        void [milliseconds, ping, bar.player.id];
    }

    if ('playerList' in jsp) {
        const player = { id: '-4294967295', name: 'Steve', isOp: () => false };
        jsp.playerList.setDisplayName(player, `§a${player.name}`);
        jsp.playerList.reset(player);
        // @ts-expect-error The name is a string.
        jsp.playerList.setDisplayName(player, 7);
    }
}

export {};
