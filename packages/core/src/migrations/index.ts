import createTasks from "./0001_create_tasks";
import createSessions from "./0002_create_sessions";
import addProviderSessionIdToSessions from "./0003_add_provider_session_id_to_sessions";

export const migrations = {
  "0001_create_tasks": createTasks,
  "0002_create_sessions": createSessions,
  "0003_add_provider_session_id_to_sessions": addProviderSessionIdToSessions,
};
