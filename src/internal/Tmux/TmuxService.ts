import { Effect, ServiceMap } from "effect";
import { type ShellError, ShellService } from "../Shell";

export interface TmuxService {
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<void, ShellError, typeof ShellService.Service>;
}

export const TmuxService = ServiceMap.Service<TmuxService>("TmuxService");
