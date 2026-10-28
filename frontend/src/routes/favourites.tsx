import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/favourites")({
  errorComponent: AppErrorComponent,
  component: FavouritesLayout,
});

function FavouritesLayout() {
  return <Outlet />;
}
