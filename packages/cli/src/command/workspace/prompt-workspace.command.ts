import { Console, Effect } from "effect";
import { Argument, Command, Prompt } from "effect/unstable/cli";
import { Workspace } from "@skippercorp/core";
import { flags, pickProject } from "./workspace.common";

const messageArgument = Argument.string("message").pipe(
  Argument.withDescription("Prompt to send to OpenCode"),
  Argument.variadic(),
  Argument.withDefault([]),
);

const promptFallback = Prompt.text({
  message: "Prompt",
  validate: (value) =>
    value.trim().length > 0 ? Effect.succeed(value) : Effect.fail("Prompt is required"),
});

export const joinPromptArgs = (message: ReadonlyArray<string>) => message.join(" ");

const resolvePrompt = (message: ReadonlyArray<string>) =>
  message.length > 0 ? Effect.succeed(joinPromptArgs(message)) : Prompt.run(promptFallback);

export const promptWorkspaceCommand = Command.make(
  "prompt",
  {
    ...flags,
    message: messageArgument,
  },
  (input) =>
    Effect.gen(function* () {
      const project = yield* pickProject(input.git, { branchMode: "existing" });
      const prompt = yield* resolvePrompt(input.message as ReadonlyArray<string>);

      yield* Workspace.promptWorkspace(project, prompt, (chunk) =>
        Effect.sync(() => {
          process.stdout.write(chunk);
        }),
      );
      yield* Console.log("");
    }),
).pipe(Command.withDescription("Run an OpenCode prompt in a workspace"));
