import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, PageBody } from "@/components/ui";
import { COPY } from "@inkboard/shared/copy";

export function NotFoundPage() {
  return (
    <AppShell>
      <PageBody className="pt-12">
        <ErrorState
          kind="not-found"
          heading
          title={COPY.pageNotOnBoard}
          body={COPY.pageMissing}
          action={
            <Button asChild>
              <Link to="/">{COPY.backToTheWall}</Link>
            </Button>
          }
        />
      </PageBody>
    </AppShell>
  );
}
