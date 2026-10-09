import { homeCopy } from "../lib/content";

type HeroCopyProps = {
  offerHref: string;
  deliveryHref: string;
  /** The mid-scroll sticker only has a job in the scroll scene, which fades it in. */
  withRhythm?: boolean;
};

/**
 * The hero's words, shared by the scroll scene and the ambient loop. The class names
 * are what the e2e specs and the scroll engine's custom properties hang on, and the
 * h1 stays plain text: the rendered-HTML tests match it as a single string.
 */
export function HeroCopy({ offerHref, deliveryHref, withRhythm = true }: HeroCopyProps) {
  const copy = homeCopy.hero;
  return (
    <div className="scene-copy">
      <div className="page-shell scene-copy-shell">
        <div className="scene-intro">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="hero-title">{copy.title}</h1>
          <p className="scene-lead">{copy.lead}</p>
          <div className="scene-actions">
            <a className="button go" href={offerHref}>
              {copy.primaryCta}
            </a>
            <a className="scene-secondary" href={deliveryHref}>
              {copy.secondaryCta}
            </a>
          </div>
          <p className="scene-hint" aria-hidden="true">
            {copy.hint}
          </p>
        </div>
        {withRhythm ? (
          <p className="scene-rhythm" aria-hidden="true">
            <strong>{copy.rhythmTitle}</strong>
            <span>{copy.rhythmSub}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
