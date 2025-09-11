"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateIntegrationNotes } from "@/ai/flows/generate-integration-notes";
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from "lucide-react";

export function IntegrationNotesGenerator() {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    setNotes("");
    try {
      const result = await generateIntegrationNotes();
      setNotes(result);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error Generating Notes",
        description: "Could not generate integration notes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">
          AI Integration Assistant
        </CardTitle>
        <CardDescription>
          Generate a guide for developers to integrate the backend with these
          frontend components.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        )}
        {notes && (
          <div className="p-4 mt-2 prose prose-sm max-w-none rounded-md bg-muted/50 dark:prose-invert">
            <pre className="p-0 bg-transparent whitespace-pre-wrap font-body">
              {notes}
            </pre>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleGenerate} disabled={loading} className="w-full">
          <Sparkles className="mr-2 h-4 w-4" />
          {loading ? "Generating..." : "Generate Integration Notes"}
        </Button>
      </CardFooter>
    </Card>
  );
}
