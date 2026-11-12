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

## Which versions connect

The server speaks Bedrock protocols <!-- fact:protocol.list -->2225 and 2193<!-- /fact -->, so
Minecraft <!-- fact:minecraft.oldest -->1.26.50<!-- /fact --> through
<!-- fact:minecraft.newest -->1.26.62<!-- /fact --> can join. The server list shows the newest of
these. A client outside that range sees Minecraft's **Outdated client** or **Outdated server**
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
