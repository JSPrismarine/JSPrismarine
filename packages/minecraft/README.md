# JSPrismarine/minecraft

This package contains data directly related to the Minecraft: Bedrock Edition game.

> Note: This is still a WIP

### Why was it introduced?

This package is introduced for its convenience in further separating the server logic from the protocol. Previously, importing the server logic was necessary to use the protocol package. However, this idea is particularly compelling for two main reasons:
* Now, we can directly generate/manage block states or other resources with this package.
* It effectively separates the game structures from the server logic, resulting in improved modularity and easier maintainability.
