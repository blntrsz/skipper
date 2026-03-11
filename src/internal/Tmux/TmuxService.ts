import { Effect, ServiceMap } from "effect";
import type { ShellError, Shell } from "../Shell";

export const Tmux = ServiceMap.Service<{
  attachSession: (
    sessionName: string,
    path: string
  ) => Effect.Effect<void, ShellError, typeof Shell.Service>;
}>("Tmux");
