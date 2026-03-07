---
name: ship
description: Branch, commit, push & PR. Outline how to ship a change to production. Workflow can be triggered with the `ship it` command.
---

## Pre-commit

Before committing changes, make sure to run tests and linters to ensure that the code is in good shape. This will help catch any issues before they are committed and pushed to the repository.

## Commit changes

To commit changes, first determine the changes in the current git repository. Then create a commit, outlining the changes made.

## Push changes & create a PR

Push the changes to the current branch, create a pull request (using github cli gh). Add a description to the PR, outlining the changes made and any relevant information for reviewers. Make sure not to list the changes but highlight what is the intent of the change.

## Main branch

If we use the main branch as the current branch, we should just push the changes directly to the main branch, without creating a PR.

## Changeset

Whenever we make a change, we should create a changeset, outlining the changes that has been made. To do this, first create a new empty file with:

```bash
bun changeset --empty
```

then fill in the changeset what has been changed

## Process

Follow this process to ship a change to production:

[pre-commit] -> [commit changes] -> [push changes & create a PR] or [main branch] -> [changeset]
