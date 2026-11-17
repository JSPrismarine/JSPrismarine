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
}

export {};
