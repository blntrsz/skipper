import { ServiceMap } from "effect";
import { WorkerService } from "./Port";

export const WorkerServiceImpl = ServiceMap.make(WorkerService, {});
