import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/favourites/")({
  beforeLoad: () => {
    throw redirect({ to: "/library", search: { tab: "saved" } });
  },
});
