import { createFileRoute, notFound } from "@tanstack/react-router";
import { NotFoundPage } from "@/components/not-found";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/$")({
  loader: () => {
    throw notFound();
  },
  errorComponent: AppErrorComponent,
  component: NotFoundPage,
});