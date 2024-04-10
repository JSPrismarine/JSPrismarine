# [![JSPrismarine](https://github.com/JSPrismarine/JSPrismarine/assets/108444335/3169ac83-0427-402d-a76d-6c1bc215c583)](https://jsprismarine.org/)

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![Contributors](https://img.shields.io/github/contributors/JSPrismarine/JSPrismarine?color=%23E30B5D)](https://github.com/JSPrismarine/JSPrismarine/graphs/contributors)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/prismarine)](https://www.npmjs.com/package/@jsprismarine/prismarine)
[![Code Coverage](https://img.shields.io/codecov/c/github/JSPrismarine/JSPrismarine?token=WLXLSJOGN3&color=63A375)](https://codecov.io/gh/JSPrismarine/JSPrismarine)
[![TODOs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/todo)](https://github.com/JSPrismarine/JSPrismarine/search?q=todo)
[![FIXMEs Counter](https://img.shields.io/github/search/JSPrismarine/JSPrismarine/fixme)](https://github.com/JSPrismarine/JSPrismarine/search?q=fixme)
[![GitHub Commit Activity](https://img.shields.io/github/commit-activity/m/JSPrismarine/JSPrismarine?color=%2387F4BC)](https://github.com/JSPrismarine/JSPrismarine/commits/master)

JSPrismarine is a dedicated Minecraft Bedrock Edition server written in TypeScript. It focuses on performance, extensibility, and ease-of-use. It is not affiliated with the official server software from Mojang AB.

## Why use JSPrismarine?

- Written in TypeScript, making it easy to use and develop plugins for. You can develop plugins in any language that transpiles into JavaScript, such as TypeScript, Kotlin, CoffeeScript, asm.js, and more.
- Open source with the permissive [MPL2](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE) license.
- Under active development.

## Getting started

**[You can find the documentation over at jsprismarine.org/docs](https://jsprismarine.org/docs/).**

Prebuilt binaries will be provided once a stable release is available. For now, you can follow the steps below or download the [latest nightly](https://github.com/JSPrismarine/JSPrismarine/actions/workflows/nightly.yml?query=branch%3Amaster) (which may or may not work before reaching `v1.0.0`).

- Linux/MacOS/Unix based OS or Windows (requires WSL)
  - You need [Node.js](https://nodejs.org) `v21`+ and [pnpm](https://pnpm.io).
  - Clone the repository: `git clone https://github.com/JSPrismarine/JSPrismarine.git`.
  - Go to the cloned repository: `cd JSPrismarine`.
  - Install dependencies: `pnpm install`.
  - Build the project: `pnpm run build`.
  - Run the server: `pnpm run start` (or `pnpm run dev` for development).

## FAQ

- Can I contribute?
  - Sure, make sure to read the [CONTRIBUTING.md](https://github.com/JSPrismarine/JSPrismarine/blob/master/CONTRIBUTING.md) file first.
- Is JSPrismarine for `Minecraft: Bedrock Edition` or `Minecraft: Java Edition`?
  - JSPrismarine is made for `Minecraft: Bedrock Edition`, but there may be plugins available to provide a `Minecraft: Java Edition` implementation.
- What devices can a player join JSPrismarine with?
  - By default, PC/Windows, Android, and iOS. With some tricks, you can also join with Xbox, Switch, and even Playstation.
- Which OSes can run JSPrismarine?
  - Any platform supporting Node.js `v21` or later.
- If my question isn't listed here, where should I ask?
  - You can join the [Discord server](https://discord.gg/fGkHZhu), or open a [GitHub issue](https://github.com/JSPrismarine/JSPrismarine/issues/new) for development-related questions.
- Why can't I join a JSPrismarine instance hosted on my Windows PC?
  - To join an instance of JSPrismarine hosted on the same Windows machine, you need to enable Loopback. Here are the steps:
    - Open Windows PowerShell as administrator.
    - Run this command: `CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"`.
    - Open Minecraft and add a server with the IP `127.0.0.1`.
    - > NOTE: This may not work reliably on WSL2 while using the experimental bridge.

## Documentation

- [Running JSPrismarine](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/running.md)

## Remarks

- JSPrismarine is still in early/active development, and no stable versions have been released yet.
