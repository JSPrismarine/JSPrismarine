&nbsp;

<img alt="Avalanche Logo" src=".github/assets/banner.png" align="left">

&nbsp;

<a href="https://discord.gg/6w8JWhy">
  <img alt="Official Discord Server" src="https://img.shields.io/discord/704967868885762108?color=%237289DA&label=discord&style=flat-square">
</a>
<a href="https://github.com/AvalanchePowered/Avalanche/actions?query=workflow%3A%22Unit+%26+Integration+Testing%22">
  <img alt="Build" src="https://img.shields.io/github/workflow/status/AvalanchePowered/Avalanche/Unit%20&%20Integration%20Testing?style=flat-square">
</a>
<a href="https://github.com/AvalanchePowered/Avalanche/commits/master">
  <img alt="GitHub Commit Activity" src="https://img.shields.io/github/commit-activity/m/AvalanchePowered/Avalanche?color=%2387F4BC&style=flat-square">
</a>
<a href="https://coveralls.io/github/AvalanchePowered/Avalanche">
  <img alt="Coveralls github" src="https://img.shields.io/coveralls/github/AvalanchePowered/Avalanche?style=flat-square">
</a>
<a href="https://www.codefactor.io/repository/github/avalanchepowered/avalanche">
  <img alt="Codefactor.io" src="https://www.codefactor.io/repository/github/avalanchepowered/avalanche/badge?style=flat-square">
</a>
<a href="https://github.com/AvalanchePowered/Avalanche/blob/master/LICENSE.md">
  <img alt="License" src="https://img.shields.io/github/license/  AvalanchePowered/Avalanche?style=flat-square">
</a>
<a href="https://github.com/AvalanchePowered/Avalanche/graphs/contributors">
  <img alt="Contributors" src="https://img.shields.io/github/contributors/AvalanchePowered/Avalanche?color=%23E30B5D&style=flat-square">
</a>
<a href="https://github.com/AvalanchePowered/Avalanche/search?q=todo">
  <img alt="TODO Counter" src="https://img.shields.io/github/search/AvalanchePowered/Avalanche/todo.svg?style=flat-square">
</a>
<a href="https://github.com/sponsors/AvalanchePowered">
  <img alt="GitHub Sponsors" src="https://img.shields.io/github/sponsors/AvalanchePowered?style=flat-square">
</a>

&nbsp;

# Introduction

Avalanche is a Minecraft server software for the Bedrock Edition codebase built using Typescript. It was built to be as performant, stable and understandable as possible, we aim to provide a hassle-free plugin development experience that will allow you to easily customize your Minecraft server in very interesting ways.


- Written in Typescript to provide an easy method to create plugins, this means in theory you can write plugins in any language that transpiles into JavaScript.
- Open source and licensed under the permissive [**Mozilla Public License 2.0 license**](LICENSE.md).
- Actively maintained by project leaders and contributors.
- Built for performance, stability and ease of use.
- Aims to provide functional access to all items & blocks in the game of Minecraft.
- Extendable functionality using plugins.

&nbsp;

> *Some of the things mentioned here may or may not be implemented in Avalanche yet. Avalanche is still in very active and early development, please consider [**contributing**](CONTRIBUTING.md) to help our development.*

&nbsp; &nbsp;

# Getting started with Avalanche

### Pre-built binaries
Pre-built binaries will be distributed through GitHub releases once stable builds begin rolling out, these binaries will not require a node environment to run, currently, you can download the [**latest nightly build**](https://github.com/AvalanchePowered/Avalanche/actions?query=branch%3Amaster+workflow%3A%22Build+artifacts%22) through GitHub artifacts.

&nbsp;

### Manual installation

Before continuing with manual installation, please ensure you have a **Linux/OSX/Unix based Operating System**, or if you are running Windows, make sure you are doing this through **Windows Subsystem for Linux**. Building requires [**Node.js**](https://nodejs.org) v16.0.0 or newer, [**NPM**](https://www.npmjs.com/package/npm) v8.0.0 or newer and [**Lerna**](https://lerna.js.org/). If you run into any problems during this process, join our [**Discord Guild**](https://discord.gg/6w8JWhy), we will be happy to help you out.

&nbsp;

- **Clone the Avalanche GitHub repository.** \
  `git clone https://github.com/AvalanchePowered/Avalanche`

- **Move yourself into the directory that was just created.** \
  `cd Avalanche`

- **Install all required dependencies for running Avalanche.** \
  `npm install` and then `lerna bootstrap`

- **Build Avalanche using NPM.** \
  `npm run build`

- **Start Avalanche and you're good to go!** \
  `npm run start` for production or `npm run dev` for development.

&nbsp; &nbsp;

# Frequently asked Questions

&nbsp;

- **Can I contribute to the project?** \
  Yes, but before you do so, please read our [**contribution guidelines**](CONTRIBUTING.md).

- **Where can I download plugins for Avalanche?** \
  Plugins for Avalanche can be downloaded from [**our website**](https://avalanchepowered.org).

- **I cannot join my Avalanche server through Windows.** \
  Windows by default does not allow you to join locally hosted servers through Minecraft, to fix this, run `CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"` through PowerShell as an administrator, then restart your game and try again.

- **What operating systems are supported by Avalanche?** \
  In theory, any operating system capable of running Node.js version 16.0.0 of newer should be able to run it, though this is not guaranteed, but you can definitely run Avalanche on Linux, OSX and Windows as they do support Node.js.

- **What devices can I join my Avalanche server using?** \
  You can easily join your server using Android, iOS and Windows 10/11. Mojang does not officially support joining external servers on PS4, Xbox One and Switch, but there are methods to workaround this that can be easily found online by doing a little bit of searching.

- **My question was not listed here, what should I do?** \
  The easiest method would be joining our [**Discord Guild**](https://discord.gg/6w8JWhy) and asking other people, alternatively you can ask on our [**forums**](https://avalanchepowered.org).