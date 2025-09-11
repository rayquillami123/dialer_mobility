"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { suggestAMIARIConnectionNotes } from "@/ai/flows/suggest-ami-ari-connection-notes";
import type { AmiAriNotesForm } from "@/lib/types";
import { Sparkles, Wand2 } from "lucide-react";

const formSchema = z.object({
  platform: z.enum(["asterisk", "freeswitch", "kamailio", "other"], {
    required_error: "Please select a platform.",
  }),
  version: z.string().min(1, "Version is required."),
  purpose: z.string().min(10, "Purpose must be at least 10 characters."),
});

export function AmiAriNotesGenerator() {
  const [loading, setLoading] = useState(false);
  const [generatedNotes, setGeneratedNotes] = useState("");
  const { toast } = useToast();

  const form = useForm<AmiAriNotesForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      platform: "asterisk",
      version: "",
      purpose: ""
    }
  });

  const onSubmit = async (data: AmiAriNotesForm) => {
    setLoading(true);
    setGeneratedNotes("");
    try {
      const result = await suggestAMIARIConnectionNotes({
        platform: data.platform,
        version: data.version,
        purpose: data.purpose,
      });
      setGeneratedNotes(result.notes);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error Suggesting Notes",
        description:
          "Could not generate AMI/ARI notes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">AMI/ARI Connection Notes</CardTitle>
        <CardDescription>
          Let AI suggest configuration notes for your AMI/ARI connections.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a platform" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="asterisk">Asterisk</SelectItem>
                      <SelectItem value="freeswitch">FreeSWITCH</SelectItem>
                      <SelectItem value="kamailio">Kamailio</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="version"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Platform Version</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 18.x" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose of Connection</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Real-time call monitoring and control for a dashboard."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={loading} className="w-full">
              <Wand2 className="mr-2 h-4 w-4" />
              {loading ? "Thinking..." : "Suggest Notes"}
            </Button>
          </form>
        </Form>
        {(loading || generatedNotes) && <div className="mt-6">
          <h4 className="font-semibold mb-2 font-headline">Suggested Notes:</h4>
            {loading && (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
              </div>
            )}
            {generatedNotes && (
              <div className="p-4 prose prose-sm max-w-none rounded-md bg-muted/50 dark:prose-invert">
                <pre className="p-0 bg-transparent whitespace-pre-wrap font-body">
                    {generatedNotes}
                </pre>
              </div>
            )}
          </div>}
      </CardContent>
    </Card>
  );
}
