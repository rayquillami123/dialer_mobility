"use client";

import type { Trunk } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MoreVertical, Pencil, Trash2, Globe, Route, Gauge, Code } from "lucide-react";

type TrunkCardProps = {
  trunk: Trunk;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: (enabled: boolean) => void;
};

export function TrunkCard({
  trunk,
  onEdit,
  onDelete,
  onToggleStatus,
}: TrunkCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="font-headline">{trunk.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 pt-1">
              <Globe className="h-4 w-4" /> <span>{trunk.host}</span>
            </CardDescription>
          </div>
          <AlertDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the trunk "{trunk.name}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Code className="w-4 h-4 shrink-0" />
            <div className="flex flex-wrap gap-1">
                {trunk.codecs.split(',').map(c => c.trim()).map(codec => <Badge key={codec} variant="secondary">{codec}</Badge>)}
            </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Route className="w-4 h-4 shrink-0" />
            <span>CLI Route: <code className="font-mono text-foreground">{trunk.cliRoute}</code></span>
        </div>
         <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="w-4 h-4 shrink-0" />
            <span>Max CPS: <span className="font-semibold text-foreground">{trunk.maxCPS}</span></span>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex items-center space-x-2">
          <Switch
            id={`status-${trunk.id}`}
            checked={trunk.enabled}
            onCheckedChange={onToggleStatus}
            aria-label="Toggle trunk status"
          />
          <Label htmlFor={`status-${trunk.id}`} className="cursor-pointer">
            {trunk.enabled ? "Enabled" : "Disabled"}
          </Label>
        </div>
      </CardFooter>
    </Card>
  );
}
