"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Edit3, SlidersHorizontal, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Github, Globe, MessageCircle, Sparkles } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useSessionStore } from "@/store/session-store";
import {
  dashboardService,
  DashboardCard,
  DashboardLayout,
  DashboardLayoutSettings,
} from "@/lib/api/dashboard";
import { InterfaceStatisticsCard } from "@/components/dashboard/InterfaceStatisticsCard";
import { InterfaceOverviewCard } from "@/components/dashboard/InterfaceOverviewCard";
import { SystemInformationCard } from "@/components/dashboard/SystemInformationCard";
import { NtpStatusCard } from "@/components/dashboard/NtpStatusCard";
import { DiskUsageCard } from "@/components/dashboard/DiskUsageCard";
import { GatewayStatusCard } from "@/components/dashboard/GatewayStatusCard";
import { LldpNeighborsCard } from "@/components/dashboard/LldpNeighborsCard";
import { ServicesStatusCard } from "@/components/dashboard/ServicesStatusCard";
import { AddCardModal } from "@/components/dashboard/AddCardModal";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DEFAULT_GRID_COLUMNS = 3;
const MIN_GRID_COLUMNS = 2;
const MAX_GRID_COLUMNS = 4;
const MAX_GRID_SCAN_ROWS = 200;
const MASONRY_ROW_HEIGHT_PX = 1;
const DEFAULT_DASHBOARD_GAP_PX = 15;
const MIN_DASHBOARD_GAP_PX = 8;
const MAX_DASHBOARD_GAP_PX = 24;

interface RuntimeLayoutSettings {
  columns: number;
  gapPx: number;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeLayoutSettings(settings?: DashboardLayoutSettings | null): RuntimeLayoutSettings {
  const requestedColumns = Number(settings?.columns ?? DEFAULT_GRID_COLUMNS);
  const requestedGap = Number(settings?.gap_px ?? DEFAULT_DASHBOARD_GAP_PX);

  const columns = clampNumber(
    Number.isFinite(requestedColumns) ? Math.floor(requestedColumns) : DEFAULT_GRID_COLUMNS,
    MIN_GRID_COLUMNS,
    MAX_GRID_COLUMNS
  );

  const gapPx = clampNumber(
    Number.isFinite(requestedGap) ? Math.floor(requestedGap) : DEFAULT_DASHBOARD_GAP_PX,
    MIN_DASHBOARD_GAP_PX,
    MAX_DASHBOARD_GAP_PX
  );

  return { columns, gapPx };
}

function getCardSpan(card: DashboardCard, columns: number): number {
  if (!card.span || card.span < 1) return 1;
  if (card.span > columns) return columns;
  return Math.floor(card.span);
}

function buildStartColumnOrder(preferredColumn: number, span: number, columns: number): number[] {
  const maxStartColumn = columns - span;
  const clampedPreferred = Math.max(0, Math.min(preferredColumn, maxStartColumn));
  const ordered = [clampedPreferred];

  for (let column = 0; column <= maxStartColumn; column++) {
    if (column !== clampedPreferred) {
      ordered.push(column);
    }
  }

  return ordered;
}

function canPlaceAt(
  occupancy: Map<number, Set<number>>,
  row: number,
  startColumn: number,
  span: number
): boolean {
  const occupiedColumns = occupancy.get(row);
  if (!occupiedColumns) return true;

  const endColumn = startColumn + span - 1;
  for (let column = startColumn; column <= endColumn; column++) {
    if (occupiedColumns.has(column)) return false;
  }
  return true;
}

function markOccupied(
  occupancy: Map<number, Set<number>>,
  row: number,
  startColumn: number,
  span: number
): void {
  if (!occupancy.has(row)) {
    occupancy.set(row, new Set());
  }

  const rowSet = occupancy.get(row)!;
  const endColumn = startColumn + span - 1;
  for (let column = startColumn; column <= endColumn; column++) {
    rowSet.add(column);
  }
}

function compactCards(cards: DashboardCard[], columns: number): DashboardCard[] {
  const occupancy: Map<number, Set<number>> = new Map();
  const cardsInPlacementOrder = [...cards].sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    if (left.column !== right.column) return left.column - right.column;
    return left.id.localeCompare(right.id);
  });

  const placementById = new Map<
    string,
    { column: number; position: number; span: number }
  >();

  for (const card of cardsInPlacementOrder) {
    const span = getCardSpan(card, columns);
    const startColumns = buildStartColumnOrder(card.column, span, columns);

    let placed = false;
    for (let row = 0; row < MAX_GRID_SCAN_ROWS && !placed; row++) {
      for (const startColumn of startColumns) {
        if (!canPlaceAt(occupancy, row, startColumn, span)) {
          continue;
        }

        markOccupied(occupancy, row, startColumn, span);
        placementById.set(card.id, {
          column: startColumn,
          position: row,
          span,
        });
        placed = true;
        break;
      }
    }

    if (!placed) {
      placementById.set(card.id, {
        column: 0,
        position: cardsInPlacementOrder.length,
        span,
      });
    }
  }

  return cards.map((card) => {
    const placement = placementById.get(card.id);
    if (!placement) return { ...card, span: getCardSpan(card, columns) };
    return {
      ...card,
      column: placement.column,
      position: placement.position,
      span: placement.span,
    };
  });
}

// Sortable card wrapper component
function SortableCard({ card, children }: { card: DashboardCard; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "cursor-grabbing" : "cursor-grab"} ${
        isOver ? "ring-2 ring-primary ring-offset-2" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// Droppable column overlay (for drag targeting only)
function DroppableColumnOverlay({
  columnId,
  editMode,
  isDragging,
}: {
  columnId: string;
  editMode: boolean;
  isDragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  if (!editMode) return null;

  const columnNumber = parseInt(columnId.split("-")[1]) + 1;

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full min-h-[800px] rounded-lg transition-all ${
        isOver
          ? "bg-primary/30 border-4 border-primary border-solid shadow-2xl"
          : isDragging
            ? "border-2 border-dashed border-primary/50 bg-primary/5"
            : "border-2 border-dashed border-border/20 bg-transparent"
      }`}
    >
      <div className={`flex flex-col items-center justify-center h-full text-lg font-bold pointer-events-none ${
        isDragging ? "opacity-100 text-primary" : "opacity-30 text-muted-foreground"
      }`}>
        <div>Column {columnNumber}</div>
        {isDragging && <div className="text-sm font-normal mt-2">Drop here</div>}
      </div>
    </div>
  );
}

function DashboardMasonryItem({
  card,
  columns,
  gapPx,
  children,
}: {
  card: DashboardCard;
  columns: number;
  gapPx: number;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [rowSpan, setRowSpan] = useState(1);
  const span = getCardSpan(card, columns);
  const maxStartColumn = columns - span;
  const startColumn = Math.max(0, Math.min(card.column, maxStartColumn)) + 1;

  const recalculateRowSpan = useCallback(() => {
    const element = contentRef.current;
    if (!element) return;

    const height = element.getBoundingClientRect().height;
    const computedSpan = Math.max(
      1,
      Math.ceil((height + gapPx) / MASONRY_ROW_HEIGHT_PX)
    );

    setRowSpan((previous) => (previous === computedSpan ? previous : computedSpan));
  }, [gapPx]);

  useLayoutEffect(() => {
    recalculateRowSpan();
  }, [recalculateRowSpan, span, card.column, card.id, columns, gapPx]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      recalculateRowSpan();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [recalculateRowSpan]);

  return (
    <div
      style={{
        gridColumn: `${startColumn} / span ${span}`,
        gridRowEnd: `span ${rowSpan}`,
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const { data: session, isPending } = useSession();
  const { loadSession } = useSessionStore();

  // Dashboard state
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [addCardModalOpen, setAddCardModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layoutSettings, setLayoutSettings] = useState<RuntimeLayoutSettings>(
    normalizeLayoutSettings()
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load dashboard layout
  const loadDashboard = async () => {
    try {
      const response = await dashboardService.getLayout();
      if (response.exists && response.layout) {
        const normalizedSettings = normalizeLayoutSettings(response.layout.settings);
        setLayoutSettings(normalizedSettings);

        // Ensure all cards have a span property (backward compatibility)
        const cardsWithSpan = (response.layout.cards || []).map((card) => {
          if (card.span === undefined) {
            // Set default span based on card type
            if (card.type === "interface-statistics" || card.type === "interface-overview") {
              return { ...card, span: 2 };
            }
            return { ...card, span: 1 };
          }
          return card;
        });
        setCards(compactCards(cardsWithSpan, normalizedSettings.columns));
      } else {
        setLayoutSettings(normalizeLayoutSettings());
        setCards([]);
      }
    } catch (err: unknown) {
      const errorCandidate = err as { message?: string; error?: string; detail?: string } | null;
      const errorMessage =
        errorCandidate?.message ||
        errorCandidate?.error ||
        errorCandidate?.detail ||
        "Unknown error";
      // Expected when user has not connected to an instance yet
      if (String(errorMessage).includes("No active instance")) {
        setCards([]);
        return;
      }
      console.error("Failed to load dashboard layout:", errorMessage);
    }
  };

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (isPending) {
        return;
      }

      if (!session?.user) {
        try {
          const response = await fetch(`/api/session/onboarding-status`, {
            method: "GET",
          });

          if (!response.ok) {
            console.error("[RootPage] Onboarding status check failed:", response.status);
            router.push("/login");
            return;
          }

          const data = await response.json();

          if (data.needs_onboarding) {
            console.log("[RootPage] Onboarding needed - redirecting to /onboarding");
            router.push("/onboarding");
          } else {
            console.log("[RootPage] Onboarding complete - redirecting to /login");
            router.push("/login");
          }
        } catch (err) {
          console.error("[RootPage] Failed to check onboarding status:", err);
          router.push("/login");
        }
        return;
      }

      await loadSession();

      // Only load dashboard layout when an active instance exists
      const currentSession = useSessionStore.getState().activeSession;
      if (currentSession) {
        await loadDashboard();
      } else {
        setCards([]);
      }
      setIsChecking(false);
    };

    checkAndRedirect();
  }, [router, session, isPending, loadSession]);

  if (isPending || isChecking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Handler functions
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);

    if (!over) {
      return;
    }

    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) {
      return;
    }

    const cardSpan = getCardSpan(activeCard, layoutSettings.columns);
    let targetColumn = 0;
    let targetPosition = 0;

    // Check if dropped on a column zone
    const columnMatch = over.id.toString().match(/^column-(\d+)$/);
    if (columnMatch) {
      targetColumn = parseInt(columnMatch[1]);
      console.log(`[Drag] Dropped on Column ${targetColumn + 1} overlay`);
    } else {
      // Check if dropped on another card
      const overCard = cards.find((c) => c.id === over.id);
      if (!overCard) {
        console.log(`[Drag] Dropped on unknown target: ${over.id}`);
        return;
      }

      // Don't do anything if dropping on itself
      if (activeCard.id === overCard.id) {
        return;
      }

      // Use the overCard's column and position as target
      targetColumn = overCard.column;
      targetPosition = overCard.position;
      console.log(`[Drag] Dropped on card at column=${targetColumn}, position=${targetPosition}`);
    }

    // SMART VALIDATION: Adjust column if span would overflow
    // A card can only start at a column where it won't exceed column 2
    const maxStartColumn = Math.max(0, layoutSettings.columns - cardSpan);
    if (targetColumn > maxStartColumn) {
      targetColumn = maxStartColumn;
    }

    // Build occupancy map from all existing cards (excluding the one being moved)
    const rowOccupancy: Map<number, Set<number>> = new Map();
    for (const card of cards) {
      if (card.id === activeCard.id) continue;

      const span = getCardSpan(card, layoutSettings.columns);
      const startCol = card.column;
      const endCol = Math.min(startCol + span - 1, layoutSettings.columns - 1);

      if (!rowOccupancy.has(card.position)) {
        rowOccupancy.set(card.position, new Set());
      }

      for (let col = startCol; col <= endCol; col++) {
        rowOccupancy.get(card.position)!.add(col);
      }
    }

    // If dropped on a column overlay, find next available row
    // If dropped on a card, try to use that card's position first
    if (columnMatch) {
      targetPosition = 0; // Start from top for column drops
    }

    // Find first available row where this card can fit
    const endCol = targetColumn + cardSpan - 1;
    let finalPosition = targetPosition;

    while (finalPosition < 100) {
      const occupied = rowOccupancy.get(finalPosition);
      if (!occupied) {
        // Row is completely empty
        break;
      }

      // Check if columns needed for this card are free
      let allFree = true;
      for (let col = targetColumn; col <= endCol; col++) {
        if (occupied.has(col)) {
          allFree = false;
          break;
        }
      }

      if (allFree) {
        // Found a free spot
        break;
      }

      finalPosition++;
    }

    const updatedCards = cards.map((c) => {
      if (c.id === activeCard.id) {
        return { ...c, column: targetColumn, position: finalPosition };
      }
      return c;
    });

    console.log(`[Drag] Placed card: column=${targetColumn}, position=${finalPosition}, span=${cardSpan}`);

    setCards(compactCards(updatedCards, layoutSettings.columns));
    setHasUnsavedChanges(true);
  };

  const handleAddCard = (cardType: string) => {
    // Determine default span based on card type
    let defaultSpan = 1;
    if (cardType === "interface-statistics" || cardType === "interface-overview") {
      defaultSpan = 2;
    }

    const newCard: DashboardCard = {
      id: `card-${Date.now()}`,
      type: cardType,
      column: 0,
      position: 0,
      span: Math.min(defaultSpan, layoutSettings.columns),
    };

    setCards(compactCards([...cards, newCard], layoutSettings.columns));
    setHasUnsavedChanges(true);
  };

  const handleRemoveCard = (cardId: string) => {
    setCards(compactCards(cards.filter((c) => c.id !== cardId), layoutSettings.columns));
    setHasUnsavedChanges(true);
  };

  const handleCardSpanChange = (cardId: string, newSpan: number) => {
    setCards(compactCards(cards.map((c) => {
      if (c.id === cardId) {
        return { ...c, span: Math.max(1, Math.min(newSpan, layoutSettings.columns)) };
      }
      return c;
    }), layoutSettings.columns));
    setHasUnsavedChanges(true);
  };

  const handleCardConfigChange = (cardId: string, config: Record<string, unknown>) => {
    setCards((previousCards) => previousCards.map((card) => {
      if (card.id !== cardId) return card;
      return {
        ...card,
        config,
      };
    }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const layout: DashboardLayout = {
        cards,
        settings: {
          columns: layoutSettings.columns,
          gap_px: layoutSettings.gapPx,
        },
      };
      await dashboardService.saveLayout(layout);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error("Failed to save dashboard layout:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload the dashboard from the saved state, discarding changes
    await loadDashboard();
    setHasUnsavedChanges(false);
  };

  const handleColumnCountChange = (value: string) => {
    const nextColumns = clampNumber(
      Number.parseInt(value, 10) || DEFAULT_GRID_COLUMNS,
      MIN_GRID_COLUMNS,
      MAX_GRID_COLUMNS
    );
    const nextSettings: RuntimeLayoutSettings = {
      ...layoutSettings,
      columns: nextColumns,
    };
    setLayoutSettings(nextSettings);
    setCards((previousCards) => compactCards(previousCards, nextColumns));
    setHasUnsavedChanges(true);
  };

  const handleGapChange = (nextGap: number) => {
    const gapPx = clampNumber(nextGap, MIN_DASHBOARD_GAP_PX, MAX_DASHBOARD_GAP_PX);
    if (layoutSettings.gapPx === gapPx) return;
    setLayoutSettings((previous) => ({
      ...previous,
      gapPx,
    }));
    setHasUnsavedChanges(true);
  };

  const renderCard = (card: DashboardCard) => {
    const baseProps = {
      config: card.config,
      onRemove: editMode ? () => handleRemoveCard(card.id) : undefined,
      span: card.span || 1,
      onSpanChange: editMode ? (newSpan: number) => handleCardSpanChange(card.id, newSpan) : undefined,
      onConfigChange: (config: Record<string, unknown>) => handleCardConfigChange(card.id, config),
    };

    switch (card.type) {
      case "system-information":
        return <SystemInformationCard {...baseProps} />;
      case "ntp-status":
        return <NtpStatusCard {...baseProps} />;
      case "disk-usage":
        return <DiskUsageCard {...baseProps} />;
      case "interface-statistics":
        return <InterfaceStatisticsCard {...baseProps} />;
      case "interface-overview":
        return <InterfaceOverviewCard {...baseProps} />;
      case "gateway-status":
        return <GatewayStatusCard {...baseProps} />;
      case "lldp-neighbors":
        return <LldpNeighborsCard {...baseProps} />;
      case "services-status":
        return <ServicesStatusCard {...baseProps} />;
      default:
        return null;
    }
  };

  const orderedCards = [...cards].sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    if (left.column !== right.column) return left.column - right.column;
    return left.id.localeCompare(right.id);
  });

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground mt-2">
                Welcome to VyManager - Professional VyOS Management Interface
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <>
                  <Button variant="outline" onClick={handleCancel} disabled={saving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Layout"}
                  </Button>
                </>
              )}
              {editMode && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        Layout
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>Columns</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={String(layoutSettings.columns)}
                        onValueChange={handleColumnCountChange}
                      >
                        <DropdownMenuRadioItem value="2">2 columns</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="3">3 columns</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="4">4 columns</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Card Spacing</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={layoutSettings.gapPx === 10}
                        onCheckedChange={() => handleGapChange(10)}
                      >
                        Tight (10px)
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={layoutSettings.gapPx === 15}
                        onCheckedChange={() => handleGapChange(15)}
                      >
                        Standard (15px)
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={layoutSettings.gapPx === 20}
                        onCheckedChange={() => handleGapChange(20)}
                      >
                        Relaxed (20px)
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={() => setAddCardModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Card
                  </Button>
                </>
              )}
              <Button
                variant={editMode ? "default" : "outline"}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Exit Edit
                  </>
                ) : (
                  <>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit Dashboard
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Beta Information Card */}
          <div className="mt-6 relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 via-purple-500/5 to-cyan-500/5 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
            <div className="relative p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Open Beta</span>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Development by</span>
                  <a
                    href="https://github.com/Community-VyProjects/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 font-medium transition-colors underline decoration-primary/30 hover:decoration-primary/60"
                  >
                    VyProjects Org
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a
                    href="https://vyprojects.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 font-medium transition-colors underline decoration-primary/30 hover:decoration-primary/60"
                  >
                    Website
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Join our</span>
                  <a
                    href="https://discord.gg/4mE6QsZtKm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-500 hover:text-purple-400 font-medium transition-colors underline decoration-purple-500/30 hover:decoration-purple-500/60"
                  >
                    Discord
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        {cards.length === 0 && !editMode ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              Your dashboard is empty. Click &quot;Edit Dashboard&quot; to add cards.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* Wrapper for grid and overlays */}
            <div className="relative">
              {/* Main masonry grid */}
              <div
                className="grid auto-rows-[1px] grid-flow-row-dense relative z-0"
                style={{
                  gridTemplateColumns: `repeat(${layoutSettings.columns}, minmax(0, 1fr))`,
                  columnGap: `${layoutSettings.gapPx}px`,
                  rowGap: 0,
                }}
              >
                <SortableContext
                  items={orderedCards.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {/* Render cards with measured row spans for gap-free stacking */}
                  {orderedCards.map((card) => {
                    const cardElement = editMode ? (
                      <SortableCard card={card}>
                        {renderCard(card)}
                      </SortableCard>
                    ) : (
                      <div>{renderCard(card)}</div>
                    );

                    return (
                      <DashboardMasonryItem
                        key={card.id}
                        card={card}
                        columns={layoutSettings.columns}
                        gapPx={layoutSettings.gapPx}
                      >
                        {cardElement}
                      </DashboardMasonryItem>
                    );
                  })}
                </SortableContext>
              </div>

              {/* Droppable column overlays (always visible in edit mode) */}
              {editMode && (
                <div
                  className={`absolute inset-0 grid z-20 ${activeId ? "pointer-events-auto" : "pointer-events-none"}`}
                  style={{
                    gridTemplateColumns: `repeat(${layoutSettings.columns}, minmax(0, 1fr))`,
                    columnGap: `${layoutSettings.gapPx}px`,
                  }}
                >
                  {Array.from({ length: layoutSettings.columns }, (_, index) => (
                    <DroppableColumnOverlay
                      key={`column-${index}`}
                      columnId={`column-${index}`}
                      editMode={editMode}
                      isDragging={!!activeId}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Drag Overlay - Shows the card being dragged */}
            <DragOverlay>
              {activeId ? (
                <div className="opacity-80 cursor-grabbing">
                  {renderCard(cards.find((c) => c.id === activeId)!)}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Add Card Modal */}
        <AddCardModal
          open={addCardModalOpen}
          onOpenChange={setAddCardModalOpen}
          onAddCard={handleAddCard}
        />
      </div>
    </AppLayout>
  );
}
