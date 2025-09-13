'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AmiAriNotesForm } from '@/lib/types';
import {
  generateIntegrationNotes,
} from '@/ai/flows/generate-integration-notes';
import {
  suggestAMIARIConnectionNotes,
} from '@/ai/flows/suggest-ami-ari-connection-notes';
import {
  generateDeveloperIntegrationGuide,
} from '@/ai/flows/generate-developer-integration-guide';
import { z } from 'zod';

const formSchema = z.object({
  platform: z.enum(['asterisk', 'freeswitch', 'kamailio', 'other']),
  version: z.string().min(1, 'Version is required'),
  purpose: z.string().min(1, 'Purpose is required'),
});

export default function IntegrationsPage() {
  const [integrationNotes, setIntegrationNotes] = useState('');
  const [amiAriNotes, setAmiAriNotes] = useState('');
  const [devGuide, setDevGuide] = useState('');
  const [loading, setLoading] = useState({
    integration: false,
    ami: false,
    guide: false,
  });

  const form = useForm<AmiAriNotesForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      platform: 'asterisk',
      version: '',
      purpose: '',
    },
  });

  const handleGenerateIntegrationNotes = async () => {
    setLoading((prev) => ({ ...prev, integration: true }));
    try {
      const notes = await generateIntegrationNotes();
      setIntegrationNotes(notes);
    } catch (error) {
      console.error('Error generating integration notes:', error);
    } finally {
      setLoading((prev) => ({ ...prev, integration: false }));
    }
  };

  const handleGenerateAmiAriNotes = async (values: AmiAriNotesForm) => {
    setLoading((prev) => ({ ...prev, ami: true }));
    try {
      const result = await suggestAMIARIConnectionNotes(values);
      setAmiAriNotes(result.notes);
    } catch (error) {
      console.error('Error generating AMI/ARI notes:', error);
    } finally {
      setLoading((prev) => ({ ...prev, ami: false }));
    }
  };

  const handleGenerateDevGuide = async () => {
    setLoading((prev) => ({ ...prev, guide: true }));
    try {
      const guide = await generateDeveloperIntegrationGuide();
      setDevGuide(guide);
    } catch (error) {
      console.error('Error generating developer guide:', error);
    } finally {
      setLoading((prev) => ({ ...prev, guide: false }));
    }
  };

  return (
    <main className="flex-1 p-6 space-y-6">
      <h1 className="text-2xl font-bold">Integrations</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Generate Integration Notes</CardTitle>
            <CardDescription>
              Create backend integration notes for the frontend components.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleGenerateIntegrationNotes}
              disabled={loading.integration}
            >
              {loading.integration
                ? 'Generating...'
                : 'Generate Trunk Integration Notes'}
            </Button>
            {integrationNotes && (
              <Textarea
                readOnly
                value={integrationNotes}
                className="mt-4 h-64"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suggest AMI/ARI Connection Notes</CardTitle>
            <CardDescription>
              Generate notes for AMI/ARI connection configurations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleGenerateAmiAriNotes)}
                className="space-y-4"
              >
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
                          <SelectItem value="freeswitch">FreeSwitch</SelectItem>
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
                      <FormLabel>Version</FormLabel>
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
                      <FormLabel>Purpose</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Real-time monitoring"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={loading.ami}>
                  {loading.ami
                    ? 'Generating...'
                    : 'Generate AMI/ARI Connection Notes'}
                </Button>
              </form>
            </Form>
            {amiAriNotes && (
              <Textarea
                readOnly
                value={amiAriNotes}
                className="mt-4 h-64"
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Generate Developer Integration Guide</CardTitle>
            <CardDescription>
              Generate a complete developer-ready integration guide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGenerateDevGuide} disabled={loading.guide}>
              {loading.guide
                ? 'Generating...'
                : 'Generate Developer Guide'}
            </Button>
            {devGuide && (
              <Textarea readOnly value={devGuide} className="mt-4 h-96" />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}