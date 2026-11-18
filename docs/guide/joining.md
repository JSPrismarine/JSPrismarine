---
title: Joining a server
description: How players add a JSPrismarine server in Minecraft, which versions connect, and what to try when they cannot.
group: Documents
category: Guides
---

# Joining a server

Players need nothing from JSPrismarine: they join with the Minecraft: Bedrock Edition client they
already have. This page is for them, and for the host answering their questions.

## Add the server

1. Open Minecraft and choose **Play**, then the **Servers** tab.
2. Choose **Add Server**.
3. Enter a name, the server's address, and its port. The port is
   <!-- fact:server.port -->19132<!-- /fact --> unless the host changed `server-port` in `config.json`.
4. Save it and select it from the list to join.

## Try the demo server

To see a JSPrismarine server before you have one to join, add the demo server: the address is
<!-- fact:demo.address -->`demo.jsprismarine.dev`<!-- /fact --> and the port is
<!-- fact:demo.port -->19132<!-- /fact -->. It is open to anyone. The
[landing page](https://jsprismarine.dev/#demo) also has a button that opens Minecraft and joins it
for you.

<!-- fact:demo.sponsor -->RespawnHost<!-- /fact --> provides part of its hosting. Rent a server of
your own at <!-- fact:demo.sponsorLink -->[rspwn.click/jsprismarine](https://rspwn.click/jsprismarine)<!-- /fact --> for
<!-- fact:demo.discount -->15%<!-- /fact --> off, and you help pay for our test servers.

## Which versions connect

The server speaks Bedrock protocols <!-- fact:protocol.list -->2225 and 2193<!-- /fact -->, which
cover Minecraft <!-- fact:minecraft.oldest -->1.26.50<!-- /fact --> through
<!-- fact:minecraft.newest -->1.26.62<!-- /fact -->. By default it accepts only the newest release,
Minecraft <!-- fact:minecraft.newestRelease -->1.26.60 through 1.26.62<!-- /fact -->, as a Bedrock Dedicated Server
does. To let older clients join, the host raises `protocol-window` in `config.json`, which counts
releases back from the newest, so a server upgrade needs no change to it. `protocol-content` then
decides whether the world holds the newest release's blocks, items and mobs, which older clients
see as a placeholder block, or only what the oldest accepted release has.
[Running a server](running.md) lists both settings. The server list shows the newest release. <!-- fact:minecraft.previewNote -->It also accepts Minecraft Preview 1.26.70.24 on protocol 2259, which the server list does not show.<!-- /fact --> A client outside that range sees Minecraft's **Outdated client** or **Outdated server**
screen: update the game, or ask the host to update the server.

## Signing in

`online-mode` is <!-- fact:server.onlineMode -->on<!-- /fact --> by default. With it on, the server
checks each player's Xbox account the way a vanilla server does, so players sign in to Minecraft
as usual. A host can turn `online-mode`
off for a private network; anyone who reaches the server can then join under any name.

## What works

JSPrismarine is under active development and does not do everything a vanilla server does yet.
The [parity tracker](https://jsprismarine.dev/parity) shows, behavior by behavior, what matches vanilla and what does not,
and [Commands and functions](../data-driven/commands.md) lists the commands you can type.

## When you cannot connect

- **The server does not appear or times out.** Check the address and the port. The server uses
  UDP, so a firewall or router has to let UDP traffic through on that port, not only TCP.
- **The server runs on the same Windows PC as the game.** Windows blocks the Minecraft app from
  reaching its own machine. Run this once in PowerShell as administrator, then add the server as
  `127.0.0.1`:

  ```powershell
  CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"
  ```

  This may not work reliably under WSL2 with its experimental network bridge.

- **Consoles.** Xbox, PlayStation and Switch do not offer custom servers in the Servers tab.
  Joining from them takes third-party tools that relay a featured server's slot; JSPrismarine
  does not provide one.

If none of this helps, ask on [Discord](https://discord.gg/kZZCDyCBbW) or
[open an issue](https://github.com/JSPrismarine/JSPrismarine/issues/new).
