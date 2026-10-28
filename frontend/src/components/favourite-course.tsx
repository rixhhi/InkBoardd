import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { isFavourite, subscribeFavourites, toggleFavourite } from "@inkboard/shared/favourites";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export function FavouriteCourseButton({
  courseId,
  title,
  teacher,
  teacherName,
  slug,
}: {
  courseId: string;
  title: string;
  teacher?: string;
  teacherName?: string;
  slug?: string;
}) {
  const [on, setOn] = useState(() => isFavourite(courseId));
  useEffect(() => subscribeFavourites(() => setOn(isFavourite(courseId))), [courseId]);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={on}
      className={cn(on && "text-accent [&_svg]:fill-current")}
      icon={Heart}
      onClick={() =>
        setOn(
          toggleFavourite({
            courseId,
            title,
            teacher: teacher ?? "",
            teacherName: teacherName ?? "",
            slug: slug ?? "",
          }),
        )
      }
    >
      {on ? "Favourited" : "Favourite"}
    </Button>
  );
}
