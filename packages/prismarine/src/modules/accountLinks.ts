import type { Module } from '@jsprismarine/kernel';

import type Server from '../Server';
import { accountLinkFile, ACCOUNT_LINKS_FILE } from '../identity/accountLinkFile';
import { AccountLinks } from '../identity/AccountLinks';
import { withCwd } from '../utils/cwd';
import { accountLinksToken } from './tokens';

/**
 * Provides the server's {@link AccountLinks} as `prismarine:account-links`. Starting the module
 * reads `account-links.json`; `account-linking` turns linking on and off while it runs.
 * @param server - The slice of the server the links read.
 * @returns The module to register on the kernel.
 */
export const accountLinksModule = (server: Pick<Server, 'getConfig'>): Module => {
    const links = new AccountLinks(accountLinkFile(withCwd(ACCOUNT_LINKS_FILE)), () =>
        server.getConfig().getAccountLinking()
    );
    return {
        id: 'prismarine:account-links',
        register: (ctx) => {
            ctx.provide(accountLinksToken, links);
        },
        start: () => links.load()
    };
};
