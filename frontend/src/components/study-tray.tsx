import { COPY } from "@inkboard/shared/copy";
import { revisionCards, revisionLines, revisionPdf, type ChapterMark } from "@/lib/study";
import { formatTime } from "@/components/player-controls";

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function StudyTray({
  title,
  query,
  onQuery,
  chapters,
  onSeek,
  onClose,
  notes,
  summaryBusy,
  onSummarize,
  summary,
  summaryNote,
}: {
  title: string;
  query: string;
  onQuery: (value: string) => void;
  chapters: ChapterMark[];
  onSeek: (t: number) => void;
  onClose: () => void;
  notes: { seconds: number; note: string }[];
  summaryBusy: boolean;
  onSummarize: () => void;
  summary: { source: string; bullets: string[] } | null;
  summaryNote: string;
}) {
  return (
    <div className="study-tray" role="dialog" aria-label={COPY.chapters}>
      <input
        className="study-find"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={COPY.findSlide}
        aria-label={COPY.findSlide}
      />
      <ul className="study-list">
        {chapters.map((ch) => (
          <li key={`${ch.uid}-${Math.round(ch.t * 10)}`}>
            <button
              type="button"
              onClick={() => {
                onSeek(ch.t);
                onClose();
              }}
            >
              <span>{ch.label}</span>
              <span className="tabular">{formatTime(ch.t)}</span>
            </button>
          </li>
        ))}
      </ul>
      {chapters.length === 0 ? <p className="study-empty">{COPY.rackEmpty}</p> : null}
      <div className="study-actions">
        <button
          type="button"
          onClick={() =>
            downloadBlob(
              "cards.txt",
              new Blob([revisionCards(title, chapters, notes)], { type: "text/tab-separated-values" }),
            )
          }
        >
          {COPY.downloadCards}
        </button>
        <button
          type="button"
          onClick={() =>
            downloadBlob(
              "sheet.pdf",
              new Blob([revisionPdf(revisionLines(title, chapters, notes))], { type: "application/pdf" }),
            )
          }
        >
          {COPY.downloadSheet}
        </button>
        <button type="button" disabled={summaryBusy} onClick={onSummarize}>
          {summaryBusy ? COPY.summarizing : COPY.summarize}
        </button>
      </div>
      {summary?.bullets.length ? (
        <div className="study-summary">
          <p>{summary.source === "model" ? COPY.summaryModel : COPY.summaryBoard}</p>
          <ul>
            {summary.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {summaryNote ? <p className="study-empty">{summaryNote}</p> : null}
    </div>
  );
}
