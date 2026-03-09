export type WorkflowShellResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export type WorkflowShellOptions = {
  readonly stdin?: string;
};

export type WorkflowContext = {
  readonly shell: (
    command: string,
    options?: WorkflowShellOptions
  ) => Promise<WorkflowShellResult>;
  readonly prompt: (text: string) => Promise<string>;
};

export type WorkflowModule<TArgs = unknown> = (
  context: WorkflowContext,
  args: TArgs
) => void | Promise<void>;
