# CLI

## Main pieces

- `Command.ts` - command model, handlers, subcommands, shared flags, command context
- `Flag.ts` / `Argument.ts` / `Param.ts` - parameter building blocks
- `GlobalFlag.ts` - built-ins like help/version behavior
- `Prompt.ts` - interactive prompting helpers
- `CliOutput.ts` / `CliError.ts` - user-visible output + failure surface

Key files:

- `packages/effect/src/unstable/cli/index.ts`
- `packages/effect/src/unstable/cli/Command.ts`
- `packages/effect/src/unstable/cli/Flag.ts`
- `packages/effect/src/unstable/cli/Param.ts`
- `packages/effect/src/unstable/cli/SEMANTICS.md`

## Semantics that matter

- Shared parent flags may appear before or after a subcommand.
- Local parent flags are not inherited by subcommands.
- Only the first value token may open a subcommand.
- `--` stops flag/subcommand parsing.
- Options may appear before, after, or between operands.
- Unknown subcommands/options should suggest close matches.
- Built-in `--help` / `--version` have global precedence.

## Edit checklist

- If parser behavior changes, update `SEMANTICS.md` and the exact locking tests together.
- Check `packages/effect/test/unstable/cli/Command.test.ts` first for behavior changes.
- Preserve explicit shared-flag behavior; avoid accidental parent leakage.

Tests:

- `packages/effect/test/unstable/cli/Command.test.ts`
- `packages/effect/test/unstable/cli/Arguments.test.ts`
- `packages/effect/test/unstable/cli/Param.test.ts`
- `packages/effect/test/unstable/cli/Prompt.test.ts`
