# Tab List

Renames the entries in the player list, the one the pause menu shows, from a template: one for
everyone, one per permission group, or one for a single player. A template mixes text with
placeholders such as `{player:ping}`, so an entry can show a rank, a ping or a health bar beside
the name, refreshed once a second. Chat and the name above the head keep the login name.

## Installing it

From the server console, install the standard placeholders addon first, since it provides the
`player`, `server` and `world` tokens a template uses, then the tab list:

```text
addon install standard-placeholders
addon install tab-list
```

It needs JSPrismarine <!-- fact:addons.tab-list.minServer -->0.23.0<!-- /fact --> or newer. The
pack also loads on Bedrock Dedicated Server, where `/tablist` says the list needs JSPrismarine,
since only JSPrismarine lets a script rename an entry.

## Templates

A template is a shorthand string, such as `{player:name} &7{player:ping}ms`, or a tree in the
shape of Bedrock's rawtext, the format `/tellraw` takes, with placeholders, conditions, animations
and gradients as its nodes. [The standard placeholders addon](../standard-placeholders/README.md)
lists the tokens, and [the JSPrismarine script module](../../docs/guide/jsprismarine-module.md) the
node kinds. `&` color codes in shorthand become `§`.

Three levels hold a template, and the first that has one wins:

1. The player's own, set with `/tablist player` or over the script event API.
2. The one for the player's primary group, from `{perms:primary_group}`. Until a pack provides
   that placeholder, this level is skipped, and the console says so once.
3. The global one, set with `/tablist format`.

A player with no template at any level keeps the login name. Until an owner sets a template, the
list is untouched.

## Commands

Every command is for operators. A template with spaces goes in quotes, as any command argument
does.

| Command                              | What it does                                        |
| ------------------------------------ | --------------------------------------------------- |
| `/tablist format`                    | Shows the global template.                          |
| `/tablist format "<template>"`       | Sets it.                                            |
| `/tablist reset`                     | Clears it, so every entry without another template shows its login name again. |
| `/tablist group <group> "<template>"` | Sets a group's template.                           |
| `/tablist group <group> remove`      | Removes it.                                         |
| `/tablist player <name> "<template>"` | Sets a player's own template, kept across their sessions and a restart. |
| `/tablist player <name> reset`       | Removes it.                                         |
| `/tablist show <name>`               | Prints what the player's entry renders to now.      |

## The config file

The global template, the group templates and the refresh interval live in
`addons/tab-list.config.json`, beside the addon's folder. `/tablist format` and `/tablist group`
write that file, and an edit in an editor applies without a reload:

```json
{
    "interval": 20,
    "templates": {
        "global": "{player:name} &7{player:ping}ms",
        "groups": {
            "admin": { "rawtext": [{ "text": "§c[Admin] " }, { "placeholder": "player:name" }] }
        }
    }
}
```

`interval` is the ticks between two renders, <!-- fact:addons.tab-list.interval -->20<!-- /fact -->
when left out. A template with an animation renders again when its frame changes, whatever the
interval. A field of the wrong shape is left out and named on the console, and the rest of the
file still applies.

## The script event API

Another pack assigns templates by sending a script event with a JSON message, so a ranks addon
can give each rank its look and an AFK addon can mark a player while they are away:

```js
system.sendScriptEvent('jsp_tablist:set_player', JSON.stringify({ player: player.name, template: '&7[AFK] {player:name}' }));
```

<!-- fact:addons.tab-list.events -->
| Event                      | Message                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `jsp_tablist:set_global`   | `{ "template": ... }`                                       |
| `jsp_tablist:set_group`    | `{ "group": "vip", "template": ... }`                       |
| `jsp_tablist:clear_group`  | `{ "group": "vip" }`                                        |
| `jsp_tablist:set_player`   | `{ "player": "<name>", "template": ..., "persist": false }` |
| `jsp_tablist:clear_player` | `{ "player": "<name>" }`                                    |
<!-- /fact -->

A `template` is a shorthand string or a tree. `player` is the name of a player who is online; a
message for anyone else is dropped and named on the console. A player template set this way lasts
until the player leaves or a `clear_player` arrives, unless `persist` is true: then it is kept on
the player across their logins and a restart, like one set with `/tablist player`. A template set
for the session wins over a kept one. A message the addon cannot read is named on the console and
changes nothing.
