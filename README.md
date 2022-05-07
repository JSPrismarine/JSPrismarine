<br />

<div>
  <center>
    <img src="https://raw.githubusercontent.com/RealTriassic/JSPrismarine/master/.github/assets/banner_transparent.png" height="152">
  </center>
</div>

<br /> <br />

<h1>Avalanche for Minecraft: Bedrock Edition.</h1>

<div>
  <a href="https://discord.gg/6w8JWhy">
    <img alt="Official Discord Server" src="https://img.shields.io/discord/704967868885762108?color=%237289DA&label=discord&style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://github.com/AvalanchePowered/Avalanche/actions?query=workflow%3A%22Unit+%26+Integration+Testing%22">
    <img alt="Build" src="https://img.shields.io/github/workflow/status/AvalanchePowered/Avalanche/Unit%20&%20Integration%20Testing?style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://github.com/AvalanchePowered/Avalanche/commits/master">
    <img alt="GitHub Commit Activity" src="https://img.shields.io/github/commit-activity/m/AvalanchePowered/Avalanche?color=%2387F4BC&style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://coveralls.io/github/AvalanchePowered/Avalanche">
    <img alt="Coveralls github" src="https://img.shields.io/coveralls/github/AvalanchePowered/Avalanche?style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://www.codefactor.io/repository/github/avalanchepowered/avalanche">
    <img alt="Codefactor.io" src="https://www.codefactor.io/repository/github/avalanchepowered/avalanche/badge?style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://github.com/AvalanchePowered/Avalanche/blob/master/LICENSE.md">
    <img alt="License" src="https://img.shields.io/github/license/  AvalanchePowered/Avalanche?style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://github.com/AvalanchePowered/Avalanche/graphs/contributors">
    <img alt="Contributors" src="https://img.shields.io/github/contributors/AvalanchePowered/Avalanche?color=%23E30B5D&style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://github.com/AvalanchePowered/Avalanche/search?q=todo">
    <img alt="TODO Counter" src="https://img.shields.io/github/search/AvalanchePowered/Avalanche/todo.svg?style=flat-square" style="margin-right: 4px;">
  </a>
  <a href="https://github.com/sponsors/AvalanchePowered">
    <img alt="GitHub Sponsors" src="https://img.shields.io/github/sponsors/AvalanchePowered?style=flat-square">
  </a>
</div>

<br />

<p>
  Avalanche is a Minecraft server software for the Bedrock Edition codebase built using Typescript. It was built to be as performant, stable and understandable as possible, we aim to provide a hassle-free plugin development experience that will allow you to easily customize your Minecraft server in very interesting ways.
</p>

<br />

> <em>Some of the things mentioned here may or may not be implemented in Avalanche yet. Avalanche is still in very active and early development, please consider [contributing](#can-i-contribute-to-the-project) to help our development.</em>


<br /> <br />

<h1>📦 Features</h1>

<ul>

  <li>
    Written in Typescript to provide an easy method to create plugins, this means in theory you can write plugins in any language that transpiles into JavaScript.
  </li>

  <li>
    Open source and licensed under the permissive <a href="https://github.com/AvalanchePowered/Avalanche/blob/master/LICENSE.md">Mozilla Public License 2.0 license</a>.
  </li>

  <li>
    Actively maintained by project leaders and contributors.
  </li>

  <li>
    Built for performance, stability and ease of use.
  </li>
  
  <li>
    Aims to provide functional access to all items & blocks in the game of Minecraft.
  </li>

  <li>
    Extendable functionality using plugins.
  </li>

</ul>

<br /> <br />

<h1>💾 Getting started with Avalanche</h1>

<p>
  Pre-built binaries will be distributed through GitHub releases once stable builds begin rolling out, these binaries will not require a node environment to run, currently, you can download the <a href="https://github.com/AvalanchePowered/Avalanche/actions?query=branch%3Amaster+workflow%3A%22Build+artifacts%22">latest nightly build</a> through GitHub artifacts.
</p>

<br />

<h2>Manual Installation</h2>

<p>
  <b>Before continuing with the manual installation, please ensure you have a Linux/OSX/Unix based Operating System, or if you are running Windows, make sure you are doing this through Windows Subsystem for Linux.</b>
</p>

<p>
  <em>Building requires <a href="https://nodejs.org" target="_blank">Node.js</a> v16.0.0 or newer, <a href="https://www.npmjs.com/package/npm" target="_blank">NPM</a> v8.0.0 or newer and <a href="https://lerna.js.org/" target="_blank">Lerna</a>. If you run into any problems during this process, join our <a href="">Discord Guild</a>, we will be happy to help you out.</em>
</p>

<br />

<ul>

  <div>
    <li>
      <b>Clone the Avalanche GitHub repository.</b>
    </li>
    <kbd>git clone https://github.com/AvalanchePowered/Avalanche</kbd>
  </div>

  <div>
    <li>
      <b>Move yourself into the directory that was just created.</b>
    </li>
    <kbd>cd Avalanche</kbd>
  </div>

  <div>
    <li>
      <b>Install all required dependencies for running Avalanche. </b>
    </li>
    <kbd>npm install</kbd> and then <kbd>lerna bootstrap</kbd>
  </div>

  <div>
    <li>
      <b>Build Avalanche using NPM.</b>
    </li>
    <kbd>npm run build</kbd>
  </div>

  <div>
    <li>
      <b>Start Avalanche and you're good to go!</b>
    </li>
    <kbd>npm run start</kbd> for production or <kbd>npm run dev</kbd> for development.
  </div>
</ul>

<br /> <br />

<h1>🔥 Frequently asked Questions</h1>

<ul>

  <div>
    <li id="can-i-contribute-to-the-project">
      <b>Can I contribute to the project?</b>
    </li>
    <p>
    Yes, but before you do so, please read our <a href="https://github.com/AvalanchePowered/Avalanche/blob/master/CONTRIBUTING.md">contribution guidelines</a>.
    </p>
  </div>

  <div>
    <li>
      <b>Where can I download plugins for Avalanche?</b>
    </li>
    <p>
      Plugins for Avalanche can be downloaded from <a href="https://avalanchepowered.org" target="_blank">our website</a>.
    </p>
  </div>

  <div>
    <li>
      <b>I cannot join my Avalanche server through Windows.</b>
    </li>
    <p>
      Windows by default does not allow you to join locally hosted servers through Minecraft, to fix this, run <kbd>CheckNetIsolation LoopbackExempt -a -n="Microsoft.MinecraftUWP_8wekyb3d8bbwe"</kbd> through PowerShell as an administrator, then restart your game and try again.
    </p>
  </div>

  <div>
    <li>
      <b>What operating systems are supported by Avalanche?</b>
    </li>
    <p>
      In theory, any operating system capable of running Node.js version 16.0.0 of newer should be able to run it, though this is not guaranteed, but you can definitely run Avalanche on Linux, OSX and Windows as they do support Node.js.
    </p>
  </div>

  <div>
    <li>
      <b>What devices can I join my Avalanche server using?</b>
    </li>
    <p>
      You can easily join your server using Android, iOS and Windows 10/11. Mojang does not officially support joining external servers on PS4, Xbox One and Switch, but there are methods to workaround this that can be easily found online by doing a little bit of searching.
    </p>
  </div>

  <div>
    <li>
      <b>My question was not listed here, what should I do?</b>
    </li>
    <p>
      The easiest method would be joining our <a href="https://discord.gg/6w8JWhy" target="_blank">Discord Guild</a> and asking other people, alternatively you can ask on our <a href="https://avalanchepowered.com" target="_blank">forums</a>. <span style="font-weight: bold;">Please do not open issues on the GitHub repository for help with running Avalanche unless you experience a bug that doesn't allow you to run it.</span>
    </p>
  </div>

</ul>
