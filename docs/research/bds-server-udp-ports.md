# `server-udp-ports` in Bedrock Dedicated Server

Researched 2026-11-11. Scope: what Bedrock Dedicated Server (BDS) accepts in `server-udp-ports` and what it does with it, so our setting can match. Covers the documented syntax across three BDS versions, what the 1.26.70.24 binary accepts and refuses, and which UDP sockets it opens. [docs/plans/webrtc-backend.md](../plans/webrtc-backend.md) is the plan this feeds.

Versions: BDS 1.26.63.1 (the release) and 1.26.70.24 (the preview), both for Linux, from the links Mojang's download API returned on 2026-11-11 (`https://net-secondary.web.minecraft-services.net/api/v1.0/download/links`), and the BDS this repository caches as `v2193`. Host: Ubuntu 26.04.1, x86-64, with three interface addresses, two IPv4 and one IPv6.

Each claim is marked as read (from a `server.properties` shipped in the archive) or run (from starting the 1.26.70.24 binary).

## Summary

- The setting changed twice. `v2193` documents comma-separated entries and repeated lines. 1.26.63.1 documents one entry, a single shared port or a range, and an optional public IP prefix. 1.26.70.24 moves the public IP to a new `server-public-ip` key, defaults the setting to `server-port`, and removes `transport` and `server-portv6`. (Read.)
- The 1.26.70.24 binary still accepts commas and repeated lines, although its comment no longer mentions them. The local ports of every entry must form one continuous range. Adjacent and overlapping ranges merge, and a gap is an error. (Run.)
- It still accepts an IP prefix, with a deprecation warning that names `server-public-ip`. Two different prefixes, or a prefix that differs from `server-public-ip`, is an error. (Run.)
- Every invalid value stops the server before it listens. (Run.)
- BDS opens no UDP socket for players until one connects. It then binds one socket for each interface address and port, and every player shares them. Six players on a two-port range used both ports and nothing else. (Run.)
- Unset, the UDP port is `server-port`, the same number as the TCP signaling port. (Read and run.)

## What the comments say

`v2193` (read):

```
# server-udp-ports=
# Configures UDP client transport ports. Multiple comma-separated entries are
# allowed, and the property may also appear on more than one line to accumulate
# configuration. This property is ignored when `transport=raknet`
# Allowed values:
#   * `internal` or `start-end` — the internal port (or range) constrains the
#     UDP local port allocation window.
#   * `[ip:]external[-external]:internal[-internal]` — additionally publishes
#     an externally reachable mapping for clients. Ranges on each
#     side of `:` must be the same length.
```

1.26.63.1 (read):

```
server-udp-ports=19132
# Configures UDP client transport ports.
# This property is ignored when `transport=raknet`.
# If not set, UDP ports are allocated from the operating system's ephemeral port range.
# Two modes are supported:
#   1. Single UDP port shared by all clients.
#   2. UDP port range, where client connections are distributed across a range of ports but will reuse ports if the range is exhausted.
# Both modes support either the same local and public port values or a public:local mapping. Ranges on each side of `:` must be the same length.
# Optionally, specify the public IP address using IP:public:local (IPv4) or [IPv6]:public:local (IPv6).
# Both port values are required with an IP prefix, even when they are the same.
```

1.26.70.24 (read):

```
# server-ip=
# Local HTTP/TCP signaling bind address, not a UDP interface selector.
# Leave empty to bind signaling to all interfaces.
# Allowed values: Raw IPv4, raw or [bracketed] IPv6, or empty. Do not include a port or hostname.

# server-public-ip=
# Must be set if the server is behind a NAT, firewall, or any other network configuration that requires port forwarding.
# Leave empty to advertise the host's own addresses.
# Allowed values: Raw IPv4, raw or [bracketed] IPv6, or empty. Do not include a port or hostname.

# server-udp-ports=
# Configures UDP client transport ports. Defaults to the same value as `server-port`.
# Two modes are available:
#   1. Single UDP port shared by all clients.
#   2. UDP port range, where client connections are distributed across a range of ports but will reuse ports if the range is exhausted.
# Both modes support either the same local and public port value or a public:local mapping.
# Ranges on each side of `:` must be the same length.
# Examples:
#   server-udp-ports=19489                   (Single UDP port shared by all clients, local and public values are the same)
#   server-udp-ports=29489:19489             (Single UDP port shared by all clients, public port:29489 must map to local port:19489)
#   server-udp-ports=19400-19500             (UDP port range, local and public values are the same)
#   server-udp-ports=21200-21300:19400-19500 (UDP port range, public port range: 21200-21300 must map to local port range: 19400-19500)
```

Also gone in 1.26.70.24: `transport`, so the server runs NetherNet only, and `server-portv6`. `enable-lan-visibility` now says only that it listens "on port 7551". (Read.)

## What the 1.26.70.24 binary accepts

Each row is one start of the server with `server-port=19610` and that value. "Starts" means it logged `Server started.` (Run.)

| Value | Result |
| --- | --- |
| unset, or empty | Starts |
| `19620` | Starts |
| ` 19620 ` (spaces around it) | Starts |
| `19620-19620` | Starts |
| `19620-19625` | Starts |
| `29489:19620` | Starts |
| `19620-19625:19620-19625` | Starts |
| `19610` (the same as `server-port`) | Starts |
| `19620,19620` | Starts |
| `19620,` | Starts |
| `19620-19622,19623-19625` (adjacent) | Starts |
| `19620-19623,19622-19625` (overlapping) | Starts |
| `29489:19620,19620` | Starts |
| `29489:19620,29490:19621` | Starts |
| `29489:19620,29500:19620` (two public ports for one local port) | Starts |
| `29489-29490:19620-19621,19622` | Starts |
| Two lines, `19620` and `19621` | Starts |
| `19620,19630` | `disjoint UDP port ranges are not supported; configure one continuous internal port range.` |
| `19620-19622,19630-19632` | The same error |
| Two lines, `19620` and `19630` | The same error |
| `19625-19620` | `reversed port range '19625-19620'.` |
| `21200-21300:19400-19450` | `entry '21200-21300:19400-19450' has mismatched range lengths.` |
| `ports`, `0`, `70000` | `Invalid Port. Port must be in the range [ 1, 65535 ]` |
| `12.19.20.18:19620:19620` | Starts, and warns `IP prefixes in server-udp-ports are deprecated. Set server-public-ip=12.19.20.18 and use port mappings without IP prefixes.` |
| `[2001:db8::1]:19620:19620` | Starts, with the same warning for `2001:db8::1` |
| `12.19.20.18:19620` (a prefix and one port) | `Invalid Port. Port must be in the range [ 1, 65535 ]` |
| `example.com:19620:19620` | `expected an IPv4 literal, raw or [bracketed] IPv6 literal, or empty; do not include a port or hostname.` |
| `1.2.3.4:19620:19620,5.6.7.8:19621:19621` | `conflicting UDP IP prefixes '1.2.3.4' and '5.6.7.8'; only one public IP is supported.` |
| `1.2.3.4:19620:19620` with `server-public-ip=5.6.7.8` | `server-public-ip '5.6.7.8' conflicts with UDP IP prefix '1.2.3.4'; configure only one public IP.` |

`server-public-ip` (run):

| Value | Result |
| --- | --- |
| `[2001:db8::1]` | Starts |
| `example.com` | `Invalid value 'example.com' for server-public-ip: expected an IPv4 literal, raw or [bracketed] IPv6 literal, or empty; do not include a port or hostname.` |
| `1.2.3.4:19620` | The same error for that value |

Every error is logged at `ERROR` with the prefix `server-udp-ports:` or the `server-public-ip` wording above, and the server exits without listening.

## Which sockets it opens

Sampled with `ss -ulpn` ten times a second while our own bots joined over NetherNet. The bots reach the login and are refused as out of date, because the preview's protocol is newer than ours, so each connection lives for a moment. (Run.)

| Setting | Players | UDP sockets while they were connected |
| --- | --- | --- |
| unset | 3 | One on port 19610 for each of the three interface addresses |
| `19620` | 5 | One on port 19620 for each interface address |
| `19620-19621` | 6 | One on each of 19620 and 19621 for each interface address, six in all |

- The sockets are bound to each interface address, not to the wildcard address.
- With no player connected, the server holds no UDP socket for players. It holds TCP `server-port` for signaling.
- The server held UDP 7551 with `enable-lan-visibility=false` in every run.
- One sample of the range run showed port 19620 alone, before 19621 appeared, so ports are opened as players arrive.

## Not checked

- How BDS picks a port for a player within a range, beyond that both ports of a two-port range were used by six players.
- What a client receives for a mapping: the candidates in the answer for `public:local` and `server-public-ip`.
- The 1.26.63.1 binary. Only its comment was read.
- A retail client. Our bots stop at the login.

## Reproduction

The archives are `bedrock-server-1.26.63.1.zip` and `bedrock-server-1.26.70.24.zip` from the download API above. For each value: copy the shipped `server.properties`, set `server-port=19610`, `enable-lan-visibility=false`, `online-mode=false` and `allow-list=false`, append the `server-udp-ports` line, start `LD_LIBRARY_PATH=. ./bedrock_server`, and type `stop` after 22 seconds. For the sockets, run `jsp-client bot --host 127.0.0.1 --port 19610 --network nethernet --count <n> --ramp 0 --duration 8s` once the server has started, and sample `ss -ulpnH` for the `bedrock_server` process.
