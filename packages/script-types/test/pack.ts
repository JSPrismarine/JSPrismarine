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

    if ('playerList' in jsp) {
        const player = { id: '-4294967295', name: 'Steve', isOp: () => false };
        jsp.playerList.setDisplayName(player, `§a${player.name}`);
        jsp.playerList.reset(player);
        // @ts-expect-error The name is a string.
        jsp.playerList.setDisplayName(player, 7);
    }
}

// The placeholders live in a module of their own, loaded the same way.
const placeholders = await (async () => {
    try {
        return await import('@jsprismarine/placeholders');
    } catch {
        return undefined;
    }
})();
if (placeholders !== undefined) {
    const { register, resolve, namespaces } = placeholders;
    const player = { id: '-4294967295' };
    const registration = register('demo', {
        keys: ['name', 'slots'],
        // A provider gets the pack's own Player, so every @minecraft/server member is there.
        resolve: (key, who) => (key === 'name' ? who?.name : jsp?.jsprismarine.maxPlayers)
    });
    register('more', { keys: ['tag'], resolve: (_key, who) => who?.getTags().join(',') });
    const text: string = resolve('{demo:name} of {demo:slots}', player);
    const names: string[] = namespaces().flatMap(({ namespace, keys }) => [namespace, ...keys]);
    // @ts-expect-error The list is read-only.
    namespaces().push({ namespace: 'x', keys: [] });
    registration.unregister();
    const template = placeholders.parse('{player:name} &7{player:ping}ms');
    const tree: import('@jsprismarine/placeholders').Template = {
        rawtext: [
            'Hi ',
            { placeholder: 'player:name' },
            { if: '{player:ping} > 150', then: [{ text: ' §c' }], else: [' §7'] },
            { animate: { interval: 10, frames: [[{ text: '.' }], ['..']] } },
            { gradient: { colors: ['#ff0000', '#0000ff'], rawtext: [{ text: 'VIP' }] } },
            { translate: 'commands.op.success', with: ['Steve'] },
            { score: { name: '@s', objective: 'kills' } },
            { selector: '@a' }
        ]
    };
    const rendered = placeholders.render(tree, player);
    const again = placeholders.render('{player:name}');
    const next: number | undefined = rendered.nextChangeTick;
    // @ts-expect-error A node kind the renderer does not know.
    placeholders.render({ rawtext: [{ bold: true }] });
    void [text, names, template.rawtext.length, again.text, next];
}

if (jsp !== undefined && 'config' in jsp) {
    const { config } = jsp;
    const value: unknown = config.value;
    const callback = config.afterEvents.change.subscribe((event) => {
        const changed: unknown = event.value;
        void changed;
    });
    config.afterEvents.change.unsubscribe(callback);
    config.write({ interval: 20 });
    // @ts-expect-error The value is read-only; `write` changes the file.
    config.value = {};
    void value;
}

export {};

if (jsp !== undefined && 'permissions' in jsp) {
    const { permissions } = jsp;
    const player = { id: '-4294967295' };
    const allowed: boolean = permissions.has(player, 'minecraft.command.kick');
    const groups: readonly string[] = permissions.groupsOf(player);
    const primary: string = permissions.primaryGroupOf(player);
    const prefix: string | undefined = permissions.metaOf(player, 'prefix');
    permissions.grant(player, 'minecraft.command.me', '2030-01-01T00:00:00Z');
    permissions.revoke(player, 'minecraft.command.me');
    permissions.grantToGroup('vip', 'minecraft.command.*');
    permissions.revokeFromGroup('vip', 'minecraft.command.*');
    permissions.addToGroup(player, 'vip', '30d');
    permissions.removeFromGroup(player, 'vip');
    const callback = permissions.afterEvents.permissionsChange.subscribe(({ target }) => {
        const changed: string | undefined =
            target === undefined ? undefined : 'group' in target ? target.group : (target.player?.id ?? target.name);
        void changed;
    });
    permissions.afterEvents.permissionsChange.unsubscribe(callback);
    // @ts-expect-error A user write takes a Player, not a group name.
    permissions.grant('vip', 'a.b');
    void [allowed, groups, primary, prefix];
}
