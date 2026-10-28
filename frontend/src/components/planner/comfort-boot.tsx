import { useEffect } from "react";
import { applyComfort } from "@inkboard/shared/planner/comfort";

export function ComfortBoot() {
  useEffect(() => {
    applyComfort();
  }, []);
  return null;
}
