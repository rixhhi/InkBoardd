import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";

import { EducatorCatalog, } from "@/components/educator-catalog";

export default function TeacherPage() {
  const { slug } = useParams({ from: "/teacher/$slug" });
  const { topic, sort, tab } = useSearch({ from: "/teacher/$slug" });
  const nav = useNavigate();

  return (
    <AppShell>
      <EducatorCatalog
        username={slug}
        topicUid={topic}
        sort={sort ?? "latest"}
        tab={tab ?? "courses"}
        onTopic={(uid) =>
          void nav({
            to: "/teacher/$slug",
            params: { slug },
            search: { topic: uid, sort, tab },
          })
        }
        onSort={(s) =>
          void nav({
            to: "/teacher/$slug",
            params: { slug },
            search: { topic, sort: s, tab },
          })
        }
        onTab={(next) =>
          void nav({
            to: "/teacher/$slug",
            params: { slug },
            search: { topic, sort, tab: next },
          })
        }
      />
    </AppShell>
  );
}
