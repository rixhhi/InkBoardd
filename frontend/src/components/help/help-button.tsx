/**
 * The "?" next to anything that needs a sentence of explanation. Opens a
 * sheet (drawer on phones, side panel on desktop) with the topic from the
 * shared help deck: what it is, how to use it, why it exists, tips, the
 * math for the curious, and the questions people actually ask.
 *
 * One component, one deck, so every "?" in the app reads the same way and
 * the Guide page (/planner/guide) is built from the same text.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, CircleHelp } from "lucide-react";
import { HELP, helpTopic, type HelpTopic, type HelpTopicId } from "@inkboard/shared/help";
import { IconButton, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";

export function HelpButton({ topic, size = "sm", className, label }: { topic: HelpTopicId; size?: "sm" | "md"; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<HelpTopicId>(topic);
  const t = helpTopic(current) ?? HELP[topic];
  return (
    <>
      <IconButton
        label={label ?? `Help: ${HELP[topic].title}`}
        icon={CircleHelp}
        size={size}
        variant="ghost"
        className={cn("help-btn text-fg-faint hover:text-fg", className)}
        onClick={() => {
          setCurrent(topic);
          setOpen(true);
        }}
      />
      <Sheet open={open} onOpenChange={setOpen} title={t.title} width="w-[26rem]">
        <HelpBody topic={t} onJump={(id) => setCurrent(id)} />
      </Sheet>
    </>
  );
}

/** Inline heading + "?" pair, so sections do not each hand-roll the flex row. */
export function HelpHeading({ children, topic, as: Tag = "h2", className, id }: { children: ReactNode; topic: HelpTopicId; as?: "h1" | "h2" | "h3"; className?: string; id?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tag id={id} className={cn("min-w-0", className)}>
        {children}
      </Tag>
      <HelpButton topic={topic} />
    </div>
  );
}

export function HelpBody({ topic: t, onJump, compact = false }: { topic: HelpTopic; onJump?: (id: HelpTopicId) => void; compact?: boolean }) {
  return (
    <article className={cn("help-body", compact && "help-body-compact")}>
      <p className="help-where">{t.where}</p>

      <h3 className="help-h">What it is</h3>
      <p>{t.what}</p>

      <h3 className="help-h">How to use it</h3>
      <ol className="help-steps">
        {t.how.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h3 className="help-h">Why it's here</h3>
      <p>{t.why}</p>

      {t.tips?.length ? (
        <>
          <h3 className="help-h">Worth knowing</h3>
          <ul className="help-tips">
            {t.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      ) : null}

      {t.math ? (
        <details className="help-math">
          <summary>The math, in plain words</summary>
          <p>{t.math}</p>
        </details>
      ) : null}

      {t.faq?.length ? (
        <>
          <h3 className="help-h">Questions people ask</h3>
          <dl className="help-faq">
            {t.faq.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      {t.see?.length ? (
        <p className="help-see">
          See also:{" "}
          {t.see.map((id, i) => (
            <span key={id}>
              {i ? " · " : ""}
              {onJump ? (
                <button type="button" className="help-link" onClick={() => onJump(id)}>
                  {HELP[id].title}
                </button>
              ) : (
                <Link to="/planner/guide" hash={id} className="help-link">
                  {HELP[id].title}
                </Link>
              )}
            </span>
          ))}
        </p>
      ) : null}

      {!compact ? (
        <p className="help-foot">
          <BookOpen aria-hidden="true" className="size-3.5" />
          <Link to="/planner/guide" hash={t.id} className="help-link">
            Read the whole guide
          </Link>
        </p>
      ) : null}
    </article>
  );
}
