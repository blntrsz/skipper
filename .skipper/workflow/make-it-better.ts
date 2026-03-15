const buildReviewPrompt = (role: string, instructions: string, diff: string) =>
  [
    `Review these local git changes as a ${role}. Staged diff comes first, then unstaged diff.`,
    instructions,
    "Only report critical, major, or minor issues.",
    "Ignore style-only feedback and nitpicks.",
    "Keep feedback concise and actionable.",
    "If nothing qualifies, say 'No actionable issues.'",
    "",
    diff,
  ].join("\n");

export default async function makeItBetterWorkflow(context: {
  shell: (command: string) => Promise<{ stdout: string }>;
  prompt: (text: string) => Promise<string>;
}) {
  const diff = await context.shell("git diff --cached --no-ext-diff; git diff --no-ext-diff");

  if (diff.stdout.trim().length === 0) {
    process.stdout.write("No local changes to review.\n");
    return;
  }

  const [securityReview, codeReview, simplificationReview] = await Promise.all([
    context.prompt(
      buildReviewPrompt(
        "security reviewer",
        "Focus on security issues, trust boundaries, auth, secrets, injection, data exposure, and unsafe defaults.",
        diff.stdout,
      ),
    ),
    context.prompt(
      buildReviewPrompt(
        "code reviewer",
        "Focus on correctness, regressions, reliability, and meaningful test gaps.",
        diff.stdout,
      ),
    ),
    context.prompt(
      buildReviewPrompt(
        "simplification reviewer",
        "Focus on unnecessary complexity, duplication, and chances to simplify without changing behavior.",
        diff.stdout,
      ),
    ),
  ]);

  const result = await context.prompt(
    [
      "Review these local git changes plus the 3 review outputs, then fix the code in the current workspace.",
      "Only act on critical, major, or minor issues.",
      "Ignore style-only feedback, nitpicks, and optional polish.",
      "Prefer the smallest safe fixes.",
      "If reviews conflict, choose the safest minimal change.",
      "If nothing actionable exists, make no file changes and say 'No actionable issues found.'",
      "After fixing, return a concise summary of what you changed and any remaining major risks.",
      "",
      "Security review:",
      securityReview.trim(),
      "",
      "Code review:",
      codeReview.trim(),
      "",
      "Simplification review:",
      simplificationReview.trim(),
      "",
      diff.stdout,
    ].join("\n"),
  );

  process.stdout.write(`${result.trim()}\n`);
}
