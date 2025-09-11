"use client";

import type { Trunk } from "@/lib/types";
import { TrunkCard } from "./trunk-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlugZap } from "lucide-react";

type TrunkListProps = {
  trunks: Trunk[];
  onEdit: (trunk: Trunk) => void;
  onDelete: (trunkId: string) => void;
  onToggleStatus: (trunkId: string, enabled: boolean) => void;
};

export function TrunkList({
  trunks,
  onEdit,
  onDelete,
  onToggleStatus,
}: TrunkListProps) {
  if (trunks.length === 0) {
    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>No Trunks Found</CardTitle>
                <CardDescription>
                    Get started by creating a new trunk provider.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center border-2 border-dashed rounded-lg">
                    <PlugZap className="w-16 h-16 text-muted-foreground" />
                    <p className="text-muted-foreground">You haven't added any trunks yet.</p>
                </div>
            </CardContent>
        </Card>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
      {trunks.map((trunk) => (
        <TrunkCard
          key={trunk.id}
          trunk={trunk}
          onEdit={() => onEdit(trunk)}
          onDelete={() => onDelete(trunk.id)}
          onToggleStatus={(enabled) => onToggleStatus(trunk.id, enabled)}
        />
      ))}
    </div>
  );
}
