"use client";

import { useState } from "react";
import type { Trunk } from "@/lib/types";
import { initialTrunks } from "@/lib/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import { Logo } from "@/components/icons";
import { TrunkForm, TrunkFormValues } from "@/components/trunks/trunk-form";
import { TrunkList } from "@/components/trunks/trunk-list";
import { IntegrationNotesGenerator } from "@/components/ai/integration-notes-generator";
import { AmiAriNotesGenerator } from "@/components/ai/ami-ari-notes-generator";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [trunks, setTrunks] = useState<Trunk[]>(initialTrunks);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrunk, setEditingTrunk] = useState<Trunk | null>(null);
  const { toast } = useToast();

  const handleSaveTrunk = (data: TrunkFormValues) => {
    if (editingTrunk) {
      setTrunks(
        trunks.map((t) =>
          t.id === editingTrunk.id ? { ...t, ...data } : t
        )
      );
      toast({
        title: "Trunk Updated",
        description: `The trunk "${data.name}" has been successfully updated.`,
      });
    } else {
      const newTrunk: Trunk = {
        id: new Date().toISOString(),
        ...data,
        enabled: true,
      };
      setTrunks([newTrunk, ...trunks]);
      toast({
        title: "Trunk Created",
        description: `The new trunk "${data.name}" has been added.`,
      });
    }
    setEditingTrunk(null);
    setIsFormOpen(false);
  };

  const handleEditTrunk = (trunk: Trunk) => {
    setEditingTrunk(trunk);
    setIsFormOpen(true);
  };

  const handleDeleteTrunk = (trunkId: string) => {
    const trunkToDelete = trunks.find(t => t.id === trunkId);
    setTrunks(trunks.filter((t) => t.id !== trunkId));
    toast({
      title: "Trunk Deleted",
      description: `The trunk "${trunkToDelete?.name}" has been removed.`,
      variant: "destructive",
    });
  };

  const handleToggleStatus = (trunkId: string, enabled: boolean) => {
    setTrunks(
      trunks.map((t) => (t.id === trunkId ? { ...t, enabled } : t))
    );
     toast({
      title: "Status Updated",
      description: `Trunk status has been changed to ${enabled ? 'enabled' : 'disabled'}.`,
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center h-16 px-4 border-b shrink-0 bg-background/80 backdrop-blur-sm md:px-8">
        <div className="flex items-center gap-3">
          <Logo className="w-8 h-8 text-primary" />
          <h1 className="text-xl font-bold tracking-tighter font-headline">
            Dialer Mobilitytech
          </h1>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8">
        <div className="grid gap-8 lg:grid-cols-5 xl:grid-cols-3">
          <div className="space-y-8 lg:col-span-3 xl:col-span-2">
            <section aria-labelledby="trunks-heading">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2
                  id="trunks-heading"
                  className="text-2xl font-bold tracking-tight font-headline"
                >
                  Trunk Management
                </h2>
                <Dialog
                  open={isFormOpen}
                  onOpenChange={(open) => {
                    setIsFormOpen(open);
                    if (!open) setEditingTrunk(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button>
                      <PlusCircle />
                      Create Trunk
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle className="font-headline">
                        {editingTrunk ? "Edit Trunk" : "Create New Trunk"}
                      </DialogTitle>
                      <DialogDescription>
                        {editingTrunk
                          ? "Modify the details of your existing trunk."
                          : "Fill in the details to add a new trunk provider."}
                      </DialogDescription>
                    </DialogHeader>
                    <TrunkForm
                      onSubmit={handleSaveTrunk}
                      defaultValues={editingTrunk}
                    />
                  </DialogContent>
                </Dialog>
              </div>

              <div className="mt-6">
                <TrunkList
                  trunks={trunks}
                  onEdit={handleEditTrunk}
                  onDelete={handleDeleteTrunk}
                  onToggleStatus={handleToggleStatus}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-8 lg:col-span-2 xl:col-span-1">
            <IntegrationNotesGenerator />
            <AmiAriNotesGenerator />
          </aside>
        </div>
      </main>
    </div>
  );
}
