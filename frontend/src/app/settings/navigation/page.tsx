"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PanelLeft, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import {
  clearHiddenSidebarIds,
  loadHiddenSidebarIds,
  saveHiddenSidebarIds,
  SIDEBAR_VISIBILITY_ITEMS,
  SidebarItemId,
} from "@/lib/sidebar-visibility";

export default function NavigationSettingsPage() {
  const [hiddenSidebarIds, setHiddenSidebarIds] = useState<Set<SidebarItemId>>(
    () => loadHiddenSidebarIds(),
  );

  const setVisibility = (id: SidebarItemId, visible: boolean, canHide: boolean) => {
    if (!canHide) return;

    setHiddenSidebarIds((previous) => {
      const next = new Set(previous);
      if (visible) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveHiddenSidebarIds(next);
      return next;
    });
  };

  const resetVisibility = () => {
    clearHiddenSidebarIds();
    setHiddenSidebarIds(new Set());
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-8 w-8" />
            Navigation Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Show or hide sidebar sections and sub-sections for this browser.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <PanelLeft className="h-5 w-5" />
                Left Panel Visibility
              </CardTitle>
              <CardDescription>
                Toggle top-level sections and child links. Settings and Navigation stay visible.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={resetVisibility}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Defaults
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {SIDEBAR_VISIBILITY_ITEMS.map((item) => {
              const itemVisible = !hiddenSidebarIds.has(item.id);
              return (
                <div key={item.id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.canHide
                          ? "Top-level section in the left sidebar."
                          : "Always visible to keep settings navigation available."}
                      </p>
                    </div>
                    <Checkbox
                      checked={itemVisible}
                      disabled={!item.canHide}
                      onCheckedChange={(checked) =>
                        setVisibility(item.id, checked === true, item.canHide)
                      }
                    />
                  </div>

                  {item.children?.length ? (
                    <div className="pl-4 space-y-2 border-l border-border/80">
                      {item.children.map((child) => {
                        const childVisible = !hiddenSidebarIds.has(child.id);
                        const disableChildToggle = !child.canHide || !itemVisible;
                        return (
                          <div key={child.id} className="flex items-center justify-between rounded-md border border-border/70 p-2">
                            <div>
                              <p className="text-sm">{child.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {!child.canHide
                                  ? "Always visible."
                                  : itemVisible
                                    ? "Child link in this section."
                                    : "Enable parent section to edit this item."}
                              </p>
                            </div>
                            <Checkbox
                              checked={childVisible}
                              disabled={disableChildToggle}
                              onCheckedChange={(checked) =>
                                setVisibility(child.id, checked === true, child.canHide)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
