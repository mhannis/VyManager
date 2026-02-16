import { ConfigTreeApi } from "./config-tree";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface TaskSchedulerTask {
  name: string;
  crontabSpec: string;
  interval: string;
  executablePath: string;
  executableArguments: string;
}

export interface SystemTaskSchedulerConfig {
  tasks: TaskSchedulerTask[];
}

class SystemTaskSchedulerService {
  private readonly api = new ConfigTreeApi("system-task-scheduler", "task_scheduler");

  async getRawConfig(refresh = false): Promise<Record<string, unknown>> {
    return this.api.getConfig<Record<string, unknown>>(refresh);
  }

  async getConfig(refresh = false): Promise<SystemTaskSchedulerConfig> {
    const root = asObject(await this.getRawConfig(refresh));
    const taskRoot = asObject(root.task);
    const tasks = Object.keys(taskRoot)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => {
        const node = asObject(taskRoot[name]);
        const executable = asObject(node.executable);
        return {
          name,
          crontabSpec: asString(node["crontab-spec"]),
          interval: asString(node.interval),
          executablePath: asString(executable.path),
          executableArguments: asString(executable.arguments),
        };
      });

    return { tasks };
  }

  async batchConfigure(operations: string[]) {
    return this.api.configure(operations);
  }
}

export const systemTaskSchedulerService = new SystemTaskSchedulerService();
