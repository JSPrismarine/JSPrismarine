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
    const slots: number = jsprismarine.maxPlayers;
    const versions: string[] = [jsprismarine.version, jsprismarine.minecraftVersion];
    // @ts-expect-error The module's values are read-only.
    jsprismarine.version = '1.0.0';
    void [name, protocol, versions, slots];

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

    if ('placeholders' in jsp) {
        const { placeholders } = jsp;
        const player = { id: '-4294967295' };
        const registration = placeholders.register('demo', {
            keys: ['name', 'slots'],
            resolve: (key, who) => (key === 'name' ? who?.id : jsp.jsprismarine.maxPlayers)
        });
        const text: string = placeholders.resolve('{demo:name} of {demo:slots}', player);
        const names: string[] = placeholders.namespaces.flatMap(({ namespace, keys }) => [namespace, ...keys]);
        // @ts-expect-error The list is read-only.
        placeholders.namespaces.push({ namespace: 'x', keys: [] });
        registration.unregister();
        void [text, names];
    }

    if ('permissions' in jsp) {
        const { permissions } = jsp;
        const player = { id: '-4294967295' };
        const allowed: boolean = permissions.has(player, 'minecraft.command.kick');
        const groups: readonly string[] = permissions.groupsOf(player);
        const primary: string = permissions.primaryGroupOf(player);
        const prefix: string | undefined = permissions.metaOf(player, 'prefix');
        permissions.grant(player, 'minecraft.command.me', '2030-01-01T00:00:00Z');
        permissions.grant('vip', 'minecraft.command.*');
        permissions.revoke('vip', 'minecraft.command.*');
        permissions.addToGroup(player, 'vip', '30d');
        permissions.removeFromGroup(player, 'vip');
        const callback = permissions.afterEvents.permissionsChange.subscribe((event) => {
            const changed: string | undefined = event.player?.id ?? event.group;
            void changed;
        });
        permissions.afterEvents.permissionsChange.unsubscribe(callback);
        // @ts-expect-error A group is named by a string, not a number.
        permissions.grant(7, 'a.b');
        void [allowed, groups, primary, prefix];
    }
}

export {};
