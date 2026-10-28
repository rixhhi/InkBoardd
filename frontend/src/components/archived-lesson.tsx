import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, EmptyState, PageBody, PageHeader } from "@/components/ui";
import { Fetching } from "@/components/fetching";
import { COPY } from "@inkboard/shared/copy";
import { notesHref } from "@inkboard/shared/notes";
import { resolveLessonNotes } from "@/lib/lesson-api";

export function ArchivedLesson({
  lessonId,
  title,
  educator,
  backTo,
  notesUrl,
}: {
  lessonId: string;
  title: string;
  educator?: string;
  backTo: string;
  notesUrl?: string | null;
}) {
  const notes = useQuery({
    queryKey: ["notes", lessonId, title],
    queryFn: ({ signal }) => resolveLessonNotes({ data: { id: lessonId, title }, signal }),
    enabled: !notesUrl,
  });
  const hitUrl = notesUrl || notes.data?.url || "";
  const pdf = hitUrl ? notesHref({ url: hitUrl, view: true }) : "";
  const download = hitUrl ? notesHref({ url: hitUrl }) : "";

  return (
    <AppShell>
      <PageHeader
        eyebrow={<Badge tone="warn">{COPY.archivedClass}</Badge>}
        title={title}
        subline={
          <>
            {educator ? <span className="block">{educator}</span> : null}
            <span className="block">{COPY.archivedLead}</span>
          </>
        }
        leading={
          <Button variant="ghost" size="sm" icon={ArrowLeft} asChild>
            <a href={backTo}>Back</a>
          </Button>
        }
        actions={
          download ? (
            <Button variant="secondary" icon={Download} asChild>
              <a href={download} download>
                Take the sheets
              </a>
            </Button>
          ) : null
        }
      />
      <PageBody>
        {pdf ? (
          <div className="overflow-hidden rounded-lg shadow-1">
            <iframe title={`${title} notes`} src={pdf} className="h-[min(78vh,900px)] w-full bg-surface" />
          </div>
        ) : notes.isLoading ? (
          <Fetching label="Looking for the notes" compact />
        ) : (
          <EmptyState icon={FileText} title="Nothing on this shelf yet" body="No notes PDF is on the CDN for this class either." />
        )}
      </PageBody>
    </AppShell>
  );
}
