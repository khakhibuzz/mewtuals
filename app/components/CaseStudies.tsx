"use client";

import { useEffect, useRef, useState } from "react";
import { CaseStudyDialog } from "./CaseStudyDialog";
import { CaseStudy, caseStudies } from "../data/caseStudies";

export function CaseStudies() {
  const [selectedStudy, setSelectedStudy] = useState<CaseStudy | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const applicationFocusPendingRef = useRef(false);

  useEffect(() => {
    if (selectedStudy || !applicationFocusPendingRef.current) return;

    applicationFocusPendingRef.current = false;
    document.getElementById("company-url")?.focus();
  }, [selectedStudy]);

  function openStudy(study: CaseStudy, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedStudy(study);
  }

  function closeStudy(restoreFocus = true) {
    applicationFocusPendingRef.current = false;
    setSelectedStudy(null);
    if (restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
  }

  function applyFromStudy() {
    applicationFocusPendingRef.current = true;
    setSelectedStudy(null);
  }

  return (
    <section className="case-studies site-section" id="how-it-works">
      <div className="section-heading case-studies-heading">
        <p className="section-label">How it works</p>
        <h2>Five ways a value path begins.</h2>
        <p>
          Each study starts with a real operating signal and ends at the smallest
          action two companies can test together.
        </p>
      </div>

      <ol aria-label="Illustrative opportunity case studies" className="case-study-rail">
        {caseStudies.map((study) => (
          <li className="case-study-item" key={study.id}>
            <button
              aria-label={`Open case study: ${study.title}`}
              className="case-study-card"
              onClick={(event) => openStudy(study, event.currentTarget)}
              type="button"
            >
              <span className="case-study-meta">
                <span>{study.number}</span>
                <span>Illustrative case study</span>
              </span>
              <span className="case-study-type">{study.opportunityType}</span>
              <strong>{study.title}</strong>
              <span className="case-study-thesis">{study.thesis}</span>
              <span aria-label="Value-path equation" className="case-study-equation">
                <span>{study.equation.need}</span>
                <i>×</i>
                <span>{study.equation.asset}</span>
                <i>×</i>
                <span>{study.equation.moment}</span>
                <i>×</i>
                <span>{study.equation.whyNow}</span>
                <i>→</i>
                <span>{study.equation.test}</span>
              </span>
              <span className="case-study-open">Open case study</span>
            </button>
          </li>
        ))}
      </ol>

      {selectedStudy && (
        <CaseStudyDialog
          onApply={applyFromStudy}
          onClose={() => closeStudy(true)}
          study={selectedStudy}
        />
      )}
    </section>
  );
}
