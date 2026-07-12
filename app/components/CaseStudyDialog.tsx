"use client";

import { useEffect, useRef } from "react";
import { CaseStudy } from "../data/caseStudies";

type CaseStudyDialogProps = {
  onApply: () => void;
  onClose: () => void;
  study: CaseStudy;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CaseStudyDialog({
  onApply,
  onClose,
  study,
}: CaseStudyDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const titleId = `${study.id}-title`;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.dataset.dialogOpen = "true";
    document.body.style.overflow = "hidden";
    backRef.current?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      delete document.body.dataset.dialogOpen;
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="case-dialog"
      ref={dialogRef}
      role="dialog"
    >
      <div className="case-dialog-toolbar">
        <button className="text-button" onClick={onClose} ref={backRef} type="button">
          Back to case studies
        </button>
        <span>{study.number} / 05</span>
      </div>

      <article className="case-dialog-article">
        <header className="case-dialog-header">
          <p className="section-label">Illustrative case study</p>
          <p className="case-dialog-type">{study.opportunityType}</p>
          <h2 id={titleId}>{study.title}</h2>
          <p className="case-dialog-thesis">{study.thesis}</p>
        </header>

        <section className="dialog-equation" aria-label="Value-path equation">
          <span>{study.equation.need}</span><i>×</i>
          <span>{study.equation.asset}</span><i>×</i>
          <span>{study.equation.moment}</span><i>×</i>
          <span>{study.equation.whyNow}</span><i>→</i>
          <strong>{study.equation.test}</strong>
        </section>

        <div className="case-dialog-grid">
          <DetailBlock heading="Situation" text={study.situation} />
          <DetailBlock heading="Signal captured" text={study.signal} />
          <DetailBlock heading="Hidden leverage" text={study.hiddenLeverage} />
          <DetailBlock heading="Proposed counterpart" text={study.counterpart} />
        </div>

        <section className="case-dialog-section">
          <h3>Value exchanged</h3>
          <div className="value-exchange-grid">
            <div><span>Represented company</span><p>{study.valueExchange.representedCompany}</p></div>
            <div><span>Counterpart</span><p>{study.valueExchange.counterpart}</p></div>
            <div><span>Customer</span><p>{study.valueExchange.customer}</p></div>
          </div>
        </section>

        <section className="case-dialog-grid case-dialog-grid-wide">
          <DetailBlock heading="Smallest two-sided test" text={study.test} />
          <DetailBlock heading="Mutuals’ first approach" quote text={study.firstApproach} />
        </section>

        <section className="case-dialog-section">
          <h3>30-day execution</h3>
          <ol className="execution-list">
            {study.executionSteps.map((step, index) => (
              <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>
            ))}
          </ol>
        </section>

        <section className="case-dialog-grid case-dialog-grid-wide">
          <ListBlock heading="Success measures" items={study.successMeasures} />
          <ListBlock heading="Risks and trust constraints" items={study.risks} />
        </section>

        <section className="decision-gate">
          <p className="section-label">The handoff</p>
          <h3>Human decision gate</h3>
          <p>{study.decisionGate}</p>
          <a className="primary-button" href="#apply" onClick={onApply}>
            Apply with this path
          </a>
        </section>
      </article>
    </div>
  );
}

function DetailBlock({
  heading,
  quote = false,
  text,
}: {
  heading: string;
  quote?: boolean;
  text: string;
}) {
  return (
    <section className="detail-block">
      <h3>{heading}</h3>
      {quote ? <blockquote>{text}</blockquote> : <p>{text}</p>}
    </section>
  );
}

function ListBlock({ heading, items }: { heading: string; items: readonly string[] }) {
  return (
    <section className="detail-block">
      <h3>{heading}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}
