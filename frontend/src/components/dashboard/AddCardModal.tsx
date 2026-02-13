"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock3, HardDrive, Link2, Network, Plus, Route, Server } from "lucide-react";

interface AvailableCard {
  type: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const AVAILABLE_CARDS: AvailableCard[] = [
  {
    type: "system-information",
    name: "System Information",
    description: "Overview of hostname, version, CPU, memory, and uptime",
    icon: Server,
  },
  {
    type: "ntp-status",
    name: "NTP Status",
    description: "Track synchronization, NTP sources, and timing health",
    icon: Clock3,
  },
  {
    type: "disk-usage",
    name: "Disk Usage",
    description: "Monitor persistent storage usage and free space",
    icon: HardDrive,
  },
  {
    type: "interface-statistics",
    name: "Interface Statistics",
    description: "View real-time network interface counters and statistics",
    icon: Network,
  },
  {
    type: "interface-overview",
    name: "Interface Overview",
    description: "pfSense-style snapshot of link state, role, and addresses",
    icon: Link2,
  },
  {
    type: "gateway-status",
    name: "Gateway Status",
    description: "pfSense-style view of the default gateway and link state",
    icon: Route,
  },
  // Future cards will be added here
];

interface AddCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCard: (cardType: string) => void;
}

export function AddCardModal({ open, onOpenChange, onAddCard }: AddCardModalProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleAdd = () => {
    if (selectedType) {
      onAddCard(selectedType);
      setSelectedType(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Dashboard Card</DialogTitle>
          <DialogDescription>
            Select a card to add to your dashboard
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 md:grid-cols-2">
          {AVAILABLE_CARDS.map((card) => {
            const Icon = card.icon;
            const isSelected = selectedType === card.type;

            return (
              <Card
                key={card.type}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary ring-2 ring-primary ring-offset-2"
                    : "hover:border-primary/50"
                }`}
                onClick={() => setSelectedType(card.type)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{card.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {card.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedType}>
            <Plus className="h-4 w-4 mr-2" />
            Add Card
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
