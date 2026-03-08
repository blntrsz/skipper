import { ServiceMap } from "effect";

export interface WorkerService {}

export const WorkerService = ServiceMap.Service<WorkerService>("WorkerService");
