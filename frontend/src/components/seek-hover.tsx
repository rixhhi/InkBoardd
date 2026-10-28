import { tipLeft } from "@/components/player-controls";
import { resolveSpriteUrl, spriteCell, type SpriteSheet } from "@/lib/sprite-sheet";

export function SeekHover({
  pct,
  label,
  time,
  sheet,
  base,
  slideUrl,
}: {
  pct: number;
  label: string;
  time: number;
  sheet?: SpriteSheet | null;
  base?: string;
  slideUrl?: string | null;
}) {
  const cell = sheet ? spriteCell(time, sheet) : null;
  const url = sheet ? resolveSpriteUrl(sheet, base) : "";
  return (
    <span className="seek-hover" style={{ left: tipLeft(pct) }} data-seek-hover="">
      {cell && url ? (
        <span
          className="seek-hover-frame"
          data-sprite-index={cell.index}
          style={{
            width: sheet!.cellW,
            height: sheet!.cellH,
            backgroundImage: `url(${JSON.stringify(url)})`,
            backgroundPosition: `${cell.x}px ${cell.y}px`,
            backgroundSize: `${cell.sheetW}px ${cell.sheetH}px`,
          }}
        />
      ) : slideUrl ? (
        <img src={slideUrl} alt="" className="seek-hover-slide" width={160} height={90} />
      ) : null}
      <span className="seek-hover-time tabular">{label}</span>
    </span>
  );
}
