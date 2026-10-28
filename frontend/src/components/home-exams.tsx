import { useQueryClient } from "@tanstack/react-query";
import { ExamCatalog } from "@/components/browse-catalog";
import { examHubQuery } from "@/lib/unacademy";
import { schedulePrefetch } from "@/lib/prefetch";

export function HomeExams() {
  const qc = useQueryClient();

  function prefetch(id: string) {
    schedulePrefetch(() => qc.prefetchQuery(examHubQuery(id)));
  }

  return <ExamCatalog onPrefetch={prefetch} />;
}
