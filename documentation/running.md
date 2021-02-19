# Running JSPrismarine

## 1. Prerequisites

-   1.1 Node 14+ & NPM 7.
-   1.2 lerna (Lerna is our monorepo manager of choice which can be installed with a simple `$ npm install -g lerna`).

## 2. Install dependencies

```bash
    # Install npm dependencies
    $ npm install

    # Setup monorepo
    $ lerna bootstrap
```

## 3. Running

```bash
    # Development
    $ npm run dev

    # Production (you should probably be using the prebuilt version however)
    $ npm run build
    $ npm run start
```
