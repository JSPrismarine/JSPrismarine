---
layout: home

hero:
    name: JSPrismarine
    text: Dedicated Minecraft Bedrock Edition server
    tagline: Written in TypeScript, published as reusable packages.
    actions:
        - theme: brand
          text: Run a server
          link: /guide/running
        - theme: alt
          text: API reference
          link: /api/

features:
    - title: One command to develop
      details: pnpm run dev starts the server from source and restarts it when any package changes, with a working interactive console.
    - title: Published packages
      details: The protocol, RakNet transport, NBT codec and world storage ship as independent npm packages under @jsprismarine.
    - title: Single executable
      details: pnpm run package builds a self-contained binary with Node's single-executable packaging.
---
