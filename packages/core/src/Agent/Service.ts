import { Data, Effect, ServiceMap } from "effect";

export interface Environment {
  username: string;
  repository: string;
}

/**
 * @since 1.0.0
 * @category Errors
 */
export class AgentServiceDeployReason extends Data.Error<{
  readonly _tag: "Donno";
  readonly cause?: unknown;
}> {}

/**
 * @since 1.0.0
 * @category Errors
 */
export class AgentServiceDeployError extends Data.TaggedError(
  "AgentServiceDeployError",
)<{
  readonly reason: AgentServiceDeployReason;
}> {}

/**
 * @since 1.0.0
 * @category Errors
 */
export class AgentServiceRunReason extends Data.Error<{
  readonly _tag: "Donno";
  readonly cause?: unknown;
}> {}

/**
 * @since 1.0.0
 * @category Errors
 */
export class AgentServiceRunError extends Data.TaggedError(
  "AgentServiceRunError",
)<{
  readonly reason: AgentServiceRunReason;
}> {
  static fromReason(
    reason: AgentServiceRunReason["_tag"],
    cause?: unknown,
  ): AgentServiceRunError {
    return new AgentServiceRunError({
      reason: new AgentServiceRunReason({ _tag: reason, cause }),
    });
  }
}

/**
 * It defines the core operations for deploying and running agents within the Skipper framework.
 * It abstracts away the underlying implementation details, allowing for different agent types
 * (e.g., Docker-based, serverless functions) to be implemented as long as they adhere to this interface.
 *
 * @since 1.0.0
 * @category Services
 */
export class AgentService extends ServiceMap.Service<
  AgentService,
  {
    deployAgent: Effect.Effect<void, AgentServiceDeployError, never>;
    runAgent: (
      prompt: string,
      environment: Environment,
    ) => Effect.Effect<void, AgentServiceRunError, never>;
  }
>()("AgentService") {}
