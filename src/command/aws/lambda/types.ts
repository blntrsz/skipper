export type QueueEnvelope = {
  rawBodyB64?: string;
  headers?: Record<string, string | undefined>;
};

export type GitHubPayload = {
  repository?: {
    full_name?: string;
  };
  action?: string;
};
