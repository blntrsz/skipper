import type { Plugin } from "@opencode-ai/plugin";
import type { AssistantMessage, Message, Part } from "@opencode-ai/sdk";
import {
  createOpenCodeSessionTracker,
  type OpenCodeLogger,
  type OpenCodeMessagePart,
} from "../../packages/core/src/Session/OpenCodeTracker";

export const SkipperSessionPlugin: Plugin = async ({
  client,
  directory,
  worktree,
}) => {
  const log: OpenCodeLogger = async ({ level, message, extra }) => {
    try {
      await client.app.log({
        body: {
          service: "skipper-session",
          level,
          message,
          extra,
        },
        query: {
          directory,
        },
      });
    } catch {
      // ignore plugin log failures
    }
  };

  const tracker = createOpenCodeSessionTracker({
    directory,
    worktree,
    getSession: async (sessionID) => {
      const response = await client.session.get<true>({
        path: { id: sessionID },
        query: { directory },
        throwOnError: true,
      });
      const data = response.data;

      return {
        id: data.id,
        title: data.title,
      };
    },
    getMessage: async (sessionID, messageID) => {
      const response = await client.session.message<true>({
        path: { id: sessionID, messageID },
        query: { directory },
        throwOnError: true,
      });
      const data = response.data;

      return {
        info: {
          id: data.info.id,
          sessionID: data.info.sessionID,
          role: data.info.role,
        },
        parts: data.parts.map(toTrackedPart),
      };
    },
    log,
  });

  const safe = async (hook: string, effect: () => Promise<void>) => {
    try {
      await effect();
    } catch (error) {
      await log({
        level: "warn",
        message: "skipper session sync failed",
        extra: {
          hook,
          error: serializeError(error),
        },
      });
    }
  };

  return {
    event: async ({ event }) => {
      await safe(event.type, async () => {
        switch (event.type) {
          case "session.created":
          case "session.updated": {
            await tracker.syncSession({
              id: event.properties.info.id,
              title: event.properties.info.title,
            });
            break;
          }
          case "message.updated": {
            if (!isCompletedAssistantMessage(event.properties.info)) {
              return;
            }

            await tracker.syncAssistantMessage(
              event.properties.info.sessionID,
              event.properties.info.id
            );
            break;
          }
          case "session.error": {
            if (event.properties.sessionID === undefined) {
              return;
            }

            await tracker.syncError(
              event.properties.sessionID,
              event.properties.error
            );
            break;
          }
          case "session.deleted": {
            await tracker.syncDeleted(event.properties.info.id);
            break;
          }
        }
      });
    },
    "chat.message": async (input, output) => {
      await safe("chat.message", async () => {
        await tracker.syncUserMessage(
          input.sessionID,
          output.message.id,
          output.parts.map(toTrackedPart)
        );
      });
    },
  };
};

const isCompletedAssistantMessage = (
  message: Message
): message is AssistantMessage =>
  message.role === "assistant" &&
  message.time.completed !== undefined &&
  message.summary !== true;

const toTrackedPart = (part: Part): OpenCodeMessagePart => {
  if (part.type === "text") {
    return {
      type: "text",
      text: part.text,
      ignored: part.ignored,
    };
  }

  if (part.type === "file") {
    if (part.source?.type === "file" || part.source?.type === "symbol") {
      return {
        type: "file",
        filename: part.filename,
        source: {
          type: part.source.type,
          path: part.source.path,
        },
      };
    }

    return {
      type: "file",
      filename: part.filename,
    };
  }

  return { type: part.type };
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
};
