"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageGuideDialog } from "@/components/common/PageGuideDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { pageGuides } from "@/lib/help/pageGuides";
import {
  systemTaskSchedulerService,
  type SystemTaskSchedulerConfig,
  type TaskSchedulerTask,
} from "@/lib/api/system-task-scheduler";

interface TaskFormState {
  name: string;
  crontabSpec: string;
  interval: string;
  executablePath: string;
  executableArguments: string;
}

const EMPTY_FORM: TaskFormState = {
  name: "",
  crontabSpec: "",
  interval: "",
  executablePath: "",
  executableArguments: "",
};

function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@%+=[\]-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeTasks(tasks: TaskSchedulerTask[]): TaskSchedulerTask[] {
  const dedupe = new Map<string, TaskSchedulerTask>();
  for (const task of tasks) {
    const name = task.name.trim();
    if (!name) continue;
    dedupe.set(name, {
      name,
      crontabSpec: task.crontabSpec.trim(),
      interval: task.interval.trim(),
      executablePath: task.executablePath.trim(),
      executableArguments: task.executableArguments.trim(),
    });
  }
  return Array.from(dedupe.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function buildOperations(current: SystemTaskSchedulerConfig | null, desiredTasks: TaskSchedulerTask[]): string[] {
  const operations: string[] = [];
  const base = "system task-scheduler task";
  const currentTasks = normalizeTasks(current?.tasks || []);
  const desired = normalizeTasks(desiredTasks);
  const currentMap = new Map(currentTasks.map((task) => [task.name, task]));
  const desiredMap = new Map(desired.map((task) => [task.name, task]));

  for (const [name, existing] of currentMap.entries()) {
    const wanted = desiredMap.get(name);
    if (
      !wanted ||
      wanted.crontabSpec !== existing.crontabSpec ||
      wanted.interval !== existing.interval ||
      wanted.executablePath !== existing.executablePath ||
      wanted.executableArguments !== existing.executableArguments
    ) {
      operations.push(`delete ${base} ${quoteCliValue(name)}`);
    }
  }

  for (const [name, task] of desiredMap.entries()) {
    const existing = currentMap.get(name);
    if (
      existing &&
      existing.crontabSpec === task.crontabSpec &&
      existing.interval === task.interval &&
      existing.executablePath === task.executablePath &&
      existing.executableArguments === task.executableArguments
    ) {
      continue;
    }

    operations.push(`set ${base} ${quoteCliValue(name)}`);
    if (task.crontabSpec) operations.push(`set ${base} ${quoteCliValue(name)} crontab-spec ${quoteCliValue(task.crontabSpec)}`);
    if (task.interval) operations.push(`set ${base} ${quoteCliValue(name)} interval ${quoteCliValue(task.interval)}`);
    operations.push(`set ${base} ${quoteCliValue(name)} executable path ${quoteCliValue(task.executablePath)}`);
    if (task.executableArguments) {
      operations.push(`set ${base} ${quoteCliValue(name)} executable arguments ${quoteCliValue(task.executableArguments)}`);
    }
  }

  return operations;
}

export default function SystemTaskSchedulerPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<SystemTaskSchedulerConfig | null>(null);
  const [tasks, setTasks] = useState<TaskSchedulerTask[]>([]);
  const [editingTaskName, setEditingTaskName] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM);

  const loadData = async (refresh: boolean) => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemTaskSchedulerService.getConfig(refresh);
      setConfig(response);
      setTasks(normalizeTasks(response.tasks));
      setEditingTaskName(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task scheduler settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  const hasChanges = useMemo(() => {
    if (!config) return false;
    return JSON.stringify(normalizeTasks(tasks)) !== JSON.stringify(normalizeTasks(config.tasks));
  }, [config, tasks]);

  const upsertTask = () => {
    const name = form.name.trim();
    const interval = form.interval.trim();
    const crontabSpec = form.crontabSpec.trim();
    const executablePath = form.executablePath.trim();
    const executableArguments = form.executableArguments.trim();

    if (!name) {
      setError("Task name is required.");
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      setError("Task name can only contain letters, numbers, dot, underscore, or dash.");
      return;
    }
    if (!interval && !crontabSpec) {
      setError("Either interval or crontab spec is required.");
      return;
    }
    if (interval && !/^\d+$/.test(interval)) {
      setError("Interval must be a whole number.");
      return;
    }
    if (!executablePath) {
      setError("Executable path is required.");
      return;
    }

    setTasks((previous) => {
      const withoutEditing = editingTaskName ? previous.filter((task) => task.name !== editingTaskName) : previous;
      return normalizeTasks([
        ...withoutEditing.filter((task) => task.name !== name),
        { name, crontabSpec, interval, executablePath, executableArguments },
      ]);
    });
    setEditingTaskName(name);
    setForm({ name, crontabSpec, interval, executablePath, executableArguments });
    setError(null);
    setSuccess(editingTaskName ? `Updated task ${name}.` : `Added task ${name}.`);
  };

  const editTask = (task: TaskSchedulerTask) => {
    setEditingTaskName(task.name);
    setForm({
      name: task.name,
      crontabSpec: task.crontabSpec,
      interval: task.interval,
      executablePath: task.executablePath,
      executableArguments: task.executableArguments,
    });
    setError(null);
    setSuccess(null);
  };

  const removeTask = (name: string) => {
    setTasks((previous) => previous.filter((task) => task.name !== name));
    if (editingTaskName === name) {
      setEditingTaskName(null);
      setForm(EMPTY_FORM);
    }
  };

  const saveConfig = async () => {
    const operations = buildOperations(config, tasks);
    if (operations.length === 0) {
      setSuccess("No changes to apply.");
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await systemTaskSchedulerService.batchConfigure(operations);
      if (!response.success) throw new Error(response.error || "VyOS rejected task scheduler changes.");
      await loadData(true);
      setSuccess("Task scheduler settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task scheduler settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Task Scheduler</h1>
            <p className="mt-1 text-muted-foreground">
              Configure recurring automation tasks under `system task-scheduler`.
            </p>
          </div>
          <PageGuideDialog guide={pageGuides.systemTaskScheduler} />
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {success && (
          <Card className="border-emerald-500/50">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-300">{success}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configured Tasks</CardTitle>
              <CardDescription>Current scheduled task definitions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Executable</TableHead>
                      <TableHead className="w-[140px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No tasks configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tasks.map((task) => (
                        <TableRow key={task.name}>
                          <TableCell>{task.name}</TableCell>
                          <TableCell>{task.crontabSpec || `interval ${task.interval}s`}</TableCell>
                          <TableCell className="font-mono text-xs">{task.executablePath}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => editTask(task)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!canEdit || saving}
                                onClick={() => removeTask(task.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingTaskName ? `Edit ${editingTaskName}` : "Add Task"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="task-name">Task Name</Label>
                <Input
                  id="task-name"
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="backup-config"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-interval">Interval Seconds (optional)</Label>
                <Input
                  id="task-interval"
                  value={form.interval}
                  onChange={(event) => setForm((previous) => ({ ...previous, interval: event.target.value }))}
                  placeholder="300"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-crontab">Crontab Spec (optional)</Label>
                <Input
                  id="task-crontab"
                  value={form.crontabSpec}
                  onChange={(event) => setForm((previous) => ({ ...previous, crontabSpec: event.target.value }))}
                  placeholder="*/5 * * * *"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-path">Executable Path</Label>
                <Input
                  id="task-path"
                  value={form.executablePath}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, executablePath: event.target.value }))
                  }
                  placeholder="/config/scripts/backup.sh"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-args">Arguments (optional)</Label>
                <Input
                  id="task-args"
                  value={form.executableArguments}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, executableArguments: event.target.value }))
                  }
                  placeholder="--quick"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={upsertTask} disabled={!canEdit || saving} className="flex-1">
                  {editingTaskName ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingTaskName ? "Update" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditingTaskName(null);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Badge variant={hasChanges ? "default" : "secondary"}>{hasChanges ? "Unsaved Changes" : "In Sync"}</Badge>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData(true)} disabled={refreshing || saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={saveConfig} disabled={!canEdit || saving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              Save Task Scheduler
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
