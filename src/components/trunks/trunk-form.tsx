"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Trunk } from "@/lib/types";
import { useEffect } from "react";

const trunkSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  host: z
    .string()
    .min(3, "Host must be at least 3 characters.")
    .refine((val) => !val.startsWith('http'), { message: "Host should be a domain or IP, not a URL."}),
  codecs: z.string().min(1, "At least one codec is required (e.g., G.711)."),
  cliRoute: z.string().startsWith("/", "CLI Route must start with a '/'."),
  maxCPS: z.coerce
    .number({ invalid_type_error: "Must be a number." })
    .int()
    .positive("Max CPS must be a positive number."),
});

export type TrunkFormValues = z.infer<typeof trunkSchema>;

type TrunkFormProps = {
  onSubmit: (data: TrunkFormValues) => void;
  defaultValues?: Trunk | null;
};

export function TrunkForm({ onSubmit, defaultValues }: TrunkFormProps) {
  const form = useForm<TrunkFormValues>({
    resolver: zodResolver(trunkSchema),
    defaultValues: defaultValues || {
      name: "",
      host: "",
      codecs: "",
      cliRoute: "",
      maxCPS: 10,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset(defaultValues);
    }
  }, [defaultValues, form]);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trunk Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Twilio Main" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="host"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Host</FormLabel>
              <FormControl>
                <Input placeholder="sip.provider.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="codecs"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Codecs</FormLabel>
              <FormControl>
                <Input placeholder="G.711, G.729, Opus" {...field} />
              </FormControl>
              <FormDescription>Comma-separated list of codecs.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cliRoute"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CLI Route</FormLabel>
              <FormControl>
                <Input placeholder="/provider/main" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxCPS"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum Calls Per Second (CPS)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">Save Trunk</Button>
      </form>
    </Form>
  );
}
