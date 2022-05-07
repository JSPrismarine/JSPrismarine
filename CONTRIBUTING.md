# Contributing to Avalanche.

👍 🎉 First off, thanks for taking the time to contribute! 🎉 👍

The following is a set of guidelines for contributing to Avalanche and its packages, which are hosted in the [AvalanchePowered Organization](https://github.com/AvalanchePowered) on GitHub. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request. Make sure to also read the [documentation](documentation/).

<br />

### Table Of Contents

[**Code of Conduct**](#code-of-conduct)

[**How can I contribute?**](#how-can-i-contribute)

-   [Reporting Bugs](#reporting-bugs)
-   [Suggesting Enhancements](#suggesting-enhancements)
-   [Your first code contribution](#your-first-code-contribution)
-   [Pull Requests](#pull-requests)

[**Styleguides**](#styleguides)

-   [Git commit messages](#git-commit-messages)
-   [TypeScript Styleguide](#typescript-styleguide)

<br />

## Code of Conduct

This project and everyone participating in it is governed by the [Avalanche Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior in our [Discord Guild](https://discord.gg/6w8JWhy).

<br />

## How can I contribute?

### Reporting Bugs

This section guides you through submitting a bug report for Avalanche. <br />
Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.

Before creating bug reports, please check [this list](#before-submitting-a-bug-report) as you might find out that you don't need to create one. When you are creating a bug report, please [include as many details as possible](#how-do-i-submit-a-good-bug-report). Fill out [the required template](.github/ISSUE_TEMPLATE/bug_report.md), the information it asks for helps us resolve issues faster.

> **Note:** If you find a **Closed** issue that seems like it is the same thing that you're experiencing, open a new issue and include a link to the original issue in the body of your new one.

<br />

### Before submitting a bug report

-   **You might be able to find the cause of the problem (and fix things yourself)**, most importantly, check if you can reproduce the problem in the latest version of Avalanche.
-   **Perform a [cursory search](https://github.com/search?q=+is%3Aissue+user%3AAvalanche)** to see if the problem has already been reported. If it has **and the issue is still open**, add a comment to the existing issue instead of opening a new one.

<br />

### How do I submit a (good) bug report?

Bugs are tracked as [GitHub issues](https://guides.github.com/features/issues/). After you've determined [which repository](#avalanche-and-packages) your bug is related to, create an issue on that repository and provide the following information by filling in [the template](.github/ISSUE_TEMPLATE/bug_report.md).

Explain the problem and include additional details to help maintainers reproduce the problem:

-   **Use a clear and descriptive title** for the issue to identify the problem.
-   **Describe the exact steps which reproduce the problem** in as many details as possible. For example, start by explaining how you started Avalanche, e.g. which command exactly you used in the terminal, or how you started Avalanche otherwise. When listing steps, **don't just say what you did, but explain how you did it**.
-   **Provide specific examples to demonstrate the steps**. Include links to files or GitHub projects, or copy/pasteable snippets, which you use in those examples. If you're providing snippets in the issue, use [Markdown code blocks](https://help.github.com/articles/markdown-basics/#multiple-lines).
-   **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
-   **Explain which behavior you expected to see instead and why.**
-   **Include screenshots and animated GIFs** if possible which show you following the described steps and clearly demonstrate the problem.
-   **If you're reporting that Avalanche crashed**, include a crash report in the issue in a [code block](https://help.github.com/articles/markdown-basics/#multiple-lines), a [file attachment](https://help.github.com/articles/file-attachments-on-issues-and-pull-requests/), or put it in a [gist](https://gist.github.com/) and provide link to that gist.
-   **If the problem wasn't triggered by a specific action**, describe what you were doing before the problem happened and share more information using the guidelines below.

Provide more context by answering these questions:

-   **Did the problem start happening recently** (e.g. after updating to a new version of Avalanche) or was this always a problem?
-   If the problem started happening recently, **can you reproduce the problem in an older version of Avalanche?** What's the most recent version in which the problem doesn't happen? You can download older versions of Avalanche from [the releases page](https://github.com/avalanchepowered/avalanche/releases).
-   **Can you reliably reproduce the issue?** If not, provide details about how often the problem happens and under which conditions it normally happens.

Include details about your configuration and environment:

-   **Which version of Avalanche are you using?** You can get the exact version by starting Avalanche.
-   **What's the name and version of the OS you're using**?
-   **Are you running Avalanche in a virtual machine?** If so, which VM software are you using and which operating systems and versions are used for the host and the guest?

<br />

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for Avalanche, including completely new features and minor improvements to existing functionality. Following these guidelines helps maintainers and the community understand your suggestion and find related suggestions.

Before creating enhancement suggestions, please check [this list](#before-submitting-an-enhancement-suggestion) as you might find out that you don't need to create one. When you are creating an enhancement suggestion, please [include as many details as possible](#how-do-i-submit-a-good-enhancement-suggestion). Fill in [the template](.github/ISSUE_TEMPLATE/feature_request.md), including the steps that you imagine you would take if the feature you're requesting existed.

<br />

### Before submitting an Enhancement suggestion

-   **Check if there's already [a plugin](https://avalanchepowered.org/resources/) which provides that enhancement.**
-   **Determine which repository the enhancement should be suggested in**
-   **Perform a [cursory search](https://github.com/search?q=+is%3Aissue+user%3AAvalanche)** to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.


#### How do I submit a (good) Enhancement suggestion?

Enhancement suggestions are tracked as [GitHub issues](https://guides.github.com/features/issues/). After you've determined which repository your enhancement suggestion is related to, create an issue on that repository and provide the following information:

-   **Use a clear and descriptive title** for the issue to identify the suggestion.
-   **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
-   **Provide specific examples to demonstrate the steps**. Include copy/pasteable snippets which you use in those examples, as [Markdown code blocks](https://help.github.com/articles/markdown-basics/#multiple-lines).
-   **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
-   **Include screenshots and animated GIFs** which help you demonstrate the steps or point out the part of Avalanche which the suggestion is related to. You can use [this tool](https://www.cockos.com/licecap/) to record GIFs on macOS and Windows, and [this tool](https://github.com/colinkeenan/silentcast) or [this tool](https://github.com/GNOME/byzanz) on Linux.
-   **Explain why this enhancement would be useful** to most Avalanche users and isn't something that can or should be implemented as a plugin.
-   **Specify which version of Avalanche you're using.**
-   **Specify the name and version of the OS you're using.**

<br />

### Your first code contribution

Unsure where to begin contributing to Avalanche? You can start by looking through these `beginner` and `help-wanted` issues:

-   [Beginner issues][beginner] - issues which should only require a few lines of code, and a test or two.
-   [Help wanted issues][help-wanted] - issues which should be a bit more involved than `beginner` issues.

Both issue lists are sorted by total number of comments. While not perfect, number of comments is a reasonable proxy for impact a given change will have.

<br />

### Pull Requests

The process described here has several goals:

-   Maintain Avalanche's quality
-   Fix problems that are important to users
-   Engage the community in working toward the best possible Avalanche
-   Enable a sustainable system for Avalanche's maintainers to review contributions

Please follow these steps to have your contribution considered by the maintainers:

1. Follow all instructions in [the template](PULL_REQUEST_TEMPLATE.md)
2. Follow the [styleguides](#styleguides)
3. After you submit your pull request, verify that all [status checks](https://help.github.com/articles/about-status-checks/) are passing <details><summary>What if the status checks are failing?</summary>If a status check is failing, and you believe that the failure is unrelated to your change, please leave a comment on the pull request explaining why you believe the failure is unrelated. A maintainer will re-run the status check for you. If we conclude that the failure was a false positive, then we will open an issue to track that problem with our status check suite.</details>

While the prerequisites above must be satisfied prior to having your pull request reviewed, the reviewer(s) may ask you to complete additional design work, tests, or other changes before your pull request can be ultimately accepted.

<br />

## Styleguides

### Git commit messages

-   Use the present tense ("Add feature" not "Added feature")
-   Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
-   Limit the first line to 72 characters or less
-   Reference issues and pull requests liberally after the first line

### TypeScript Styleguide

All TypeScript code is linted with [Prettier](https://prettier.io/).

-   Prefer the object spread operator (`{...anotherObj}`) to `Object.assign()`

[beginner]: https://github.com/search?utf8=%E2%9C%93&q=is%3Aopen+is%3Aissue+label%3Abeginner+label%3Ahelp-wanted+user%3Ajsprismarine+sort%3Acomments-desc
[help-wanted]: https://github.com/search?q=is%3Aopen+is%3Aissue+label%3Ahelp-wanted+user%3Ajsprismarine+sort%3Acomments-desc+-label%3Abeginner
