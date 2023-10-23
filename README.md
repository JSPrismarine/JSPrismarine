# JSPrismarine

<a href="https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE">
  <img alt="License" src="https://img.shields.io/github/license/JSPrismarine/JSPrismarine?style=flat-square">
</a>
<a href="https://github.com/JSPrismarine/JSPrismarine/graphs/contributors">
  <img alt="Contributors" src="https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D&style=flat-square">
</a>
<a href="https://github.com/JSPrismarine/JSPrismarine/commits/master">
  <img alt="GitHub Commit Activity" src="https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC&style=flat-square">
</a>
<a href="https://github.com/JSPrismarine/JSPrismarine/actions?query=workflow%3A%22Unit+%26+Integration+Testing%22">
  <img alt="Build" src="https://img.shields.io/github/actions/workflow/status/JSPrismarine/JSPrismarine/build.yml?style=flat-square&branch=master">
</a>
<a href="https://discord.gg/6w8JWhy">
  <img alt="Join the Discord Server" src="https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord&style=flat-square">
</a>
<a href="https://github.com/JSPrismarine/JSPrismarine/search?q=todo">
  <img alt="TODOs Counter" src="https://img.shields.io/github/search/JSPrismarine/JSPrismarine/todo?style=flat-square">
</a>
<a href="https://github.com/JSPrismarine/JSPrismarine/search?q=fixme">
  <img alt="FIXMEs Counter" src="https://img.shields.io/github/search/JSPrismarine/JSPrismarine/fixme?style=flat-square">
</a>
<a href="https://wakatime.com/badge/github/JSPrismarine/JSPrismarine">
  <img src="https://wakatime.com/badge/github/JSPrismarine/JSPrismarine.svg?style=flat-square" alt="wakatime">
</a>

JSPrismarine is dedicated Minecraft Bedrock Edition server written in TypeScript with focus on performance, extensibility and ease-of-use. It shares no code or affiliation what-so-server with the official server software from Mojang AB.

## Why use JSPrismarine?

-   Written in TypeScript which means that it's easy to use and develop plugins for. You can in theory develop plugins in any language that transpile into JavaScript (such as TypeScript, Kotlin, CoffeeScript, asm.js and many more).
-   Open Source with the permissive [MPL2](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE) license.
-   Under active development.

## Getting started

Prebuilt binaries will be provided once a stable release is out, these will not require a node environment. For now however, you can either follow the steps bellow or download the [latest nightly](https://github.com/JSPrismarine/JSPrismarine/actions?query=branch%3Amaster+workflow%3A%22Build+artifacts%22) (which may or may not work before we hit `v1.0.0`).

-   Linux/MacOS/Unix based OS or Windows (requires WSL)
    -   You need [Node.js](https://nodejs.org) `v18`+ and [npm](https://www.npmjs.com) `v8`+.
    -   Clone the repository `git clone https://github.com/JSPrismarine/JSPrismarine.git`.
    -   Go in the cloned repository `cd JSPrismarine`.
    -   Install dependencies `npm install`.
    -   Before running production build you have to build it `npm run build`.
    -   You're done, you can run it using `npm run start` (or `npm run dev` for development).

## FAQ

-   Can I contribute?
    -   Sure, make sure to read the [CONTRIBUTING.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/CONTRIBUTING.md) file first.
-   Is JSPrismarine for `Minecraft: Bedrock Edition` or `Minecraft: Java Edition`?
    -   JSPrismarine is made for `Minecraft: Bedrock Edition`, there may however be plugin(s) available to provide a `Minecraft: Java Edition` implementation..
-   What devices devices can a player join JSPrismarine with?
    -   By default PC/Windows, Android, iOS. However with some tricks you can also join with Xbox One, Switch and the PS4.
-   Which OSes can run JSPrismarine?
    -   Any platform supporting Node.js LTS (current `v18`) or later.
-   Does it support plugins?
    -   Yes but JSPrismarine is in fast development-mode which means that currently SEMVER isn't strictly followed. We do however try to provide a deprecation warning two weeks ahead of removing an API function.
-   If my question isn't listed here where should I sak?
    -   You can join the [Discord server](https://discord.gg/fGkHZhu), ask on the [forums](https://prismarine.dev) or in case of a development-related question issue an open a [GitHub issue](https://github.com/HerryYT/JSPrismarine/issues/new).
-   Why can't I join a JSPrismarine instance hosted on my Windows PC?
    -   To join an instance of JSPrismarine hosted on the same Windows machine you need to enable Loopback by doing the following:
        -   Open Windows PowerShell as administrator.
        -   Run this command: `CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"`.
        -   Open Minecraft and add a server with the ip `127.0.0.1`.
        -   > NOTE: This is iffy on WSL2 while using the experimental bridge

## Documentation

-   [Running JSPrismarine](documentation/running.md)
-   [Publish a new version](documentation/publish-package.md)
-   [Experimental flags](documentation/experimental-flags.md)

## Remarks

-   JSPrismarine still in early/active development, currently no stable version(s) released.
-   The plugin API isn't stable.
-   Development has substaintially slowed down, will hopefully spped up again in the somewhat near future.
