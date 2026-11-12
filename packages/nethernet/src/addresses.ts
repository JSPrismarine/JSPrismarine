import { BlockList, isIPv4, isIPv6 } from 'node:net';

/** The ranges no host on the internet can send to: private, shared, loopback, link-local and the like. */
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    // Carrier-grade NAT, which mobile networks and overlay networks number hosts from.
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 3]
] as const) {
    NOT_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
    ['::', 127],
    // Unique local addresses, which a container network numbers its hosts from.
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8]
] as const) {
    NOT_PUBLIC.addSubnet(network, prefix, 'ipv6');
}

/** The family of an IP literal as `BlockList` names it, or undefined for anything else. */
export const familyOf = (address: string): 'ipv4' | 'ipv6' | undefined =>
    isIPv4(address) ? 'ipv4' : isIPv6(address) ? 'ipv6' : undefined;

/** An IPv4 address a dual-stack socket reports as `::ffff:a.b.c.d`, as the IPv4 address it is. */
export const unmapped = (address: string): string => {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
    return mapped !== undefined && isIPv4(mapped) ? mapped : address;
};

/** Whether a host elsewhere on the internet can send to the address. False for text that is no IP literal. */
export const isPublicAddress = (address: string): boolean => {
    const plain = unmapped(address);
    const family = familyOf(plain);
    return family !== undefined && !NOT_PUBLIC.check(plain, family);
};

/** Whether two IP literals name one address, however each spells it. */
export const sameAddress = (a: string, b: string): boolean => {
    const family = familyOf(a);
    if (family === undefined || family !== familyOf(b)) return false;
    const one = new BlockList();
    one.addAddress(a, family);
    return one.check(b, family);
};
