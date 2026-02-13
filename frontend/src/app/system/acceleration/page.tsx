"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { showService } from "@/lib/api/show";
import {
  systemService,
  type QatConfig,
  type QatStatus,
  type VppConfig,
  type VppInterfaceDriver,
  type VppStatus,
} from "@/lib/api/system";
import { AlertCircle, CheckCircle2, Cpu, RefreshCw, Save, Server, Trash2, Zap } from "lucide-react";

function normalizeString(value: string): string {
  return value.trim();
}

export default function SystemAccelerationPage() {
  const { canWrite } = usePermissions();
  const canEditSystem = canWrite(FeatureGroup.SYSTEM);

  const [activeTab, setActiveTab] = useState<"qat" | "vpp">("qat");

  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>([]);
  const [interfacesLoading, setInterfacesLoading] = useState(true);

  const [qatConfig, setQatConfig] = useState<QatConfig | null>(null);
  const [qatStatus, setQatStatus] = useState<QatStatus | null>(null);
  const [qatLoading, setQatLoading] = useState(true);

  const [vppConfig, setVppConfig] = useState<VppConfig | null>(null);
  const [vppStatus, setVppStatus] = useState<VppStatus | null>(null);
  const [vppLoading, setVppLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newVppInterface, setNewVppInterface] = useState<string>("");
  const [newVppDriver, setNewVppDriver] = useState<VppInterfaceDriver>("dpdk");

  const activeLoading = useMemo(() => {
    if (activeTab === "qat") return qatLoading;
    return vppLoading;
  }, [activeTab, qatLoading, vppLoading]);

  const loadInterfaces = async () => {
    setInterfacesLoading(true);
    try {
      const counters = await showService.getInterfaceCounters();
      const names = Array.from(new Set(counters.interfaces.map((item) => item.interface)))
        .filter((name) => !!name && name !== "lo")
        .sort((left, right) => left.localeCompare(right));
      setAvailableInterfaces(names);
    } catch {
      setAvailableInterfaces([]);
    } finally {
      setInterfacesLoading(false);
    }
  };

  const loadQat = async (refresh: boolean = false) => {
    setQatLoading(true);
    try {
      const [config, status] = await Promise.all([
        systemService.getQatConfig(refresh),
        systemService.getQatStatus(),
      ]);
      setQatConfig(config);
      setQatStatus(status);
    } finally {
      setQatLoading(false);
    }
  };

  const loadVpp = async (refresh: boolean = false) => {
    setVppLoading(true);
    try {
      const [config, status] = await Promise.all([
        systemService.getVppConfig(refresh),
        systemService.getVppStatus(),
      ]);
      setVppConfig(config);
      setVppStatus(status);
    } finally {
      setVppLoading(false);
    }
  };

  const loadVppStatusOnly = async () => {
    setVppLoading(true);
    try {
      const status = await systemService.getVppStatus();
      setVppStatus(status);
    } finally {
      setVppLoading(false);
    }
  };

  const vppAvailable = vppStatus?.available === true;

  useEffect(() => {
    (async () => {
      setError(null);
      await Promise.all([loadInterfaces(), loadQat(false), loadVppStatusOnly()]).catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load acceleration data.");
      });
    })();
  }, []);

  useEffect(() => {
    if (activeTab === "vpp" && !vppAvailable && !vppLoading) {
      setActiveTab("qat");
    }
  }, [activeTab, vppAvailable, vppLoading]);

  useEffect(() => {
    if (activeTab !== "vpp") return;
    if (!vppAvailable) return;
    if (vppConfig) return;
    loadVpp(false).catch(() => {
      // handled via UI error state on refresh/save
    });
  }, [activeTab, vppAvailable, vppConfig]);

  const handleRefresh = async () => {
    setSuccess(null);
    setError(null);
    try {
      if (activeTab === "qat") {
        await loadQat(true);
      } else {
        if (!vppAvailable) {
          setError("VPP is not available on this VyOS image.");
          return;
        }
        await loadVpp(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh acceleration data.");
    }
  };

  const handleSaveQat = async () => {
    if (!qatConfig) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateQatConfig({ enabled: qatConfig.enabled });
      setQatConfig(updated);
      const latest = await systemService.getQatStatus();
      setQatStatus(latest);
      setSuccess("QAT configuration updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update QAT configuration.");
    } finally {
      setSaving(false);
    }
  };

  const addVppInterfaceDriver = () => {
    if (!vppConfig) return;
    const iface = normalizeString(newVppInterface);
    if (!iface) return;

    setVppConfig((previous) => {
      if (!previous) return previous;
      if (previous.interfaces.some((entry) => entry.interface === iface)) return previous;
      return {
        ...previous,
        interfaces: [...previous.interfaces, { interface: iface, driver: newVppDriver }]
          .sort((a, b) => a.interface.localeCompare(b.interface)),
      };
    });
    setNewVppInterface("");
  };

  const updateVppInterfaceDriver = (iface: string, driver: VppInterfaceDriver) => {
    setVppConfig((previous) => {
      if (!previous) return previous;
      const next = previous.interfaces.map((entry) => {
        if (entry.interface !== iface) return entry;
        return { ...entry, driver };
      });
      return { ...previous, interfaces: next };
    });
  };

  const removeVppInterfaceDriver = (iface: string) => {
    setVppConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, interfaces: previous.interfaces.filter((entry) => entry.interface !== iface) };
    });
  };

  const handleSaveVpp = async () => {
    if (!vppConfig) return;
    if (!vppAvailable) {
      setError("VPP is not available on this VyOS image.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await systemService.updateVppConfig(vppConfig);
      setVppConfig(updated);
      const latest = await systemService.getVppStatus();
      setVppStatus(latest);
      setSuccess("VPP settings updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update VPP settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Zap className="h-8 w-8" />
              Acceleration
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure hardware/software acceleration features such as Intel QAT and VPP (DPDK/XDP).
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={activeLoading || saving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${activeLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "qat" | "vpp")}>
          <TabsList>
            <TabsTrigger value="qat">Intel QAT</TabsTrigger>
            <TabsTrigger value="vpp" disabled={!vppAvailable || vppLoading}>
              VPP (DPDK/XDP)
              {!vppAvailable && !vppLoading && (
                <Badge variant="outline" className="ml-2 bg-muted text-muted-foreground border-border">
                  Unavailable
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          {!vppLoading && vppStatus && !vppAvailable && (
            <p className="text-xs text-muted-foreground">
              VPP is not available on this VyOS image. It typically requires the VyOS VPP addon / Stream build.
            </p>
          )}

          <TabsContent value="qat" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    QAT Configuration
                  </CardTitle>
                  <CardDescription>
                    Enable Intel QuickAssist Technology acceleration when supported by hardware.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {qatLoading || !qatConfig ? (
                    <div className="text-muted-foreground text-sm">Loading QAT configuration...</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={qatConfig.enabled}
                          onCheckedChange={(checked) => setQatConfig({ enabled: checked === true })}
                          disabled={!canEditSystem || saving}
                        />
                        <Label className="text-sm font-medium">Enable QAT acceleration</Label>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveQat} disabled={!canEditSystem || saving || qatLoading}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : "Save QAT Configuration"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    QAT Status
                  </CardTitle>
                  <CardDescription>Device detection and runtime status output.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {!qatStatus ? (
                    <p className="text-muted-foreground">No status available.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={qatStatus.available ? "default" : "secondary"}>
                          {qatStatus.available ? "Available" : "Unavailable"}
                        </Badge>
                      </div>

                      {qatStatus.error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {qatStatus.error}
                        </div>
                      )}

                      {qatStatus.raw_devices && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Devices</Label>
                          <Textarea readOnly value={qatStatus.raw_devices} className="font-mono text-xs min-h-[140px]" />
                        </div>
                      )}

                      {qatStatus.raw_status && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Textarea readOnly value={qatStatus.raw_status} className="font-mono text-xs min-h-[140px]" />
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vpp" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    VPP Settings
                  </CardTitle>
                  <CardDescription>
                    Configure VPP interface drivers (DPDK/XDP) and related host/memory settings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {vppLoading || !vppConfig ? (
                    <div className="text-muted-foreground text-sm">Loading VPP configuration...</div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={vppConfig.enabled}
                          onCheckedChange={(checked) => {
                            setVppConfig((previous) => {
                              if (!previous) return previous;
                              return { ...previous, enabled: checked === true };
                            });
                          }}
                          disabled={!canEditSystem || saving}
                        />
                        <Label className="text-sm font-medium">Enable VPP settings</Label>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Interface Drivers</Label>

                        <div className="flex flex-col md:flex-row gap-2">
                          <Select
                            value={newVppInterface}
                            onValueChange={setNewVppInterface}
                            disabled={!canEditSystem || saving || interfacesLoading}
                          >
                            <SelectTrigger className="w-full md:w-[260px]">
                              <SelectValue placeholder={interfacesLoading ? "Loading interfaces..." : "Select interface"} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableInterfaces.map((iface) => (
                                <SelectItem key={iface} value={iface}>
                                  {iface}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={newVppDriver}
                            onValueChange={(value) => setNewVppDriver(value as VppInterfaceDriver)}
                            disabled={!canEditSystem || saving}
                          >
                            <SelectTrigger className="w-full md:w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dpdk">DPDK</SelectItem>
                              <SelectItem value="xdp">XDP</SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            variant="outline"
                            onClick={addVppInterfaceDriver}
                            disabled={!canEditSystem || saving || !newVppInterface}
                          >
                            Add
                          </Button>
                        </div>

                        {vppConfig.interfaces.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No interface drivers configured.</p>
                        ) : (
                          <div className="rounded-md border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Interface</TableHead>
                                  <TableHead>Driver</TableHead>
                                  <TableHead className="w-[60px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {vppConfig.interfaces.map((entry) => (
                                  <TableRow key={entry.interface}>
                                    <TableCell className="font-mono text-xs">{entry.interface}</TableCell>
                                    <TableCell>
                                      <Select
                                        value={entry.driver}
                                        onValueChange={(value) =>
                                          updateVppInterfaceDriver(entry.interface, value as VppInterfaceDriver)
                                        }
                                        disabled={!canEditSystem || saving}
                                      >
                                        <SelectTrigger className="w-[160px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="dpdk">DPDK</SelectItem>
                                          <SelectItem value="xdp">XDP</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeVppInterfaceDriver(entry.interface)}
                                        disabled={!canEditSystem || saving}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Host Resources</Label>
                          <div className="grid gap-2">
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">nr-hugepages</Label>
                              <Input
                                className="col-span-2"
                                type="number"
                                min={0}
                                value={vppConfig.host_resources.nr_hugepages ?? ""}
                                onChange={(event) => {
                                  const raw = event.target.value.trim();
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      host_resources: {
                                        ...previous.host_resources,
                                        nr_hugepages: raw ? Number(raw) : null,
                                      },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">max-map-count</Label>
                              <Input
                                className="col-span-2"
                                type="number"
                                min={0}
                                value={vppConfig.host_resources.max_map_count ?? ""}
                                onChange={(event) => {
                                  const raw = event.target.value.trim();
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      host_resources: {
                                        ...previous.host_resources,
                                        max_map_count: raw ? Number(raw) : null,
                                      },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">shmmax</Label>
                              <Input
                                className="col-span-2"
                                value={vppConfig.host_resources.shmmax ?? ""}
                                placeholder="6442450944"
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      host_resources: {
                                        ...previous.host_resources,
                                        shmmax: raw.trim() ? raw : null,
                                      },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">LCP</Label>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs">
                              <Checkbox
                                checked={vppConfig.lcp.ignore_kernel_routes}
                                onCheckedChange={(checked) => {
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      lcp: { ...previous.lcp, ignore_kernel_routes: checked === true },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                              Ignore kernel routes
                            </label>
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">rx-buffer-size</Label>
                              <Input
                                className="col-span-2"
                                value={vppConfig.lcp.netlink.rx_buffer_size ?? ""}
                                placeholder="536870912"
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      lcp: {
                                        ...previous.lcp,
                                        netlink: {
                                          ...previous.lcp.netlink,
                                          rx_buffer_size: raw.trim() ? raw : null,
                                        },
                                      },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Memory</Label>
                          <div className="grid gap-2">
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">main-heap-size</Label>
                              <Input
                                className="col-span-2"
                                value={vppConfig.memory.main_heap_size ?? ""}
                                placeholder="4G"
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      memory: { ...previous.memory, main_heap_size: raw.trim() ? raw : null },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">main-heap-page-size</Label>
                              <Input
                                className="col-span-2"
                                value={vppConfig.memory.main_heap_page_size ?? ""}
                                placeholder="default-hugepage"
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      memory: { ...previous.memory, main_heap_page_size: raw.trim() ? raw : null },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Statseg</Label>
                          <div className="grid gap-2">
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">size</Label>
                              <Input
                                className="col-span-2"
                                value={vppConfig.statseg.size ?? ""}
                                placeholder="256M"
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return { ...previous, statseg: { ...previous.statseg, size: raw.trim() ? raw : null } };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-2">
                              <Label className="text-xs text-muted-foreground col-span-1">page-size</Label>
                              <Input
                                className="col-span-2"
                                value={vppConfig.statseg.page_size ?? ""}
                                placeholder="default-hugepage"
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setVppConfig((previous) => {
                                    if (!previous) return previous;
                                    return {
                                      ...previous,
                                      statseg: { ...previous.statseg, page_size: raw.trim() ? raw : null },
                                    };
                                  });
                                }}
                                disabled={!canEditSystem || saving}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleSaveVpp} disabled={!canEditSystem || saving || vppLoading}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : "Save VPP Settings"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    VPP Status
                  </CardTitle>
                  <CardDescription>Best-effort runtime output.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {!vppStatus ? (
                    <p className="text-muted-foreground">No status available.</p>
                  ) : (
                    <>
                      <Badge variant={vppStatus.available ? "default" : "secondary"}>
                        {vppStatus.available ? "Available" : "Unavailable"}
                      </Badge>

                      {vppStatus.error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {vppStatus.error}
                        </div>
                      )}

                      {vppStatus.raw_output ? (
                        <Textarea
                          readOnly
                          value={vppStatus.raw_output}
                          className="font-mono text-xs min-h-[320px]"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">No output available.</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
