/**
 * OnboardingSurvey.tsx
 *
 * First-run onboarding survey — an in-block overlay shown over the map the
 * first time a fresh install views or creates a Windrose map. Four broad
 * questions plus a review step preset from the answers; skippable at any
 * point (skip = everything enabled).
 *
 * Completion writes the full feature record + onboardingState 'done' via the
 * plugin ref; the resulting windrose-settings-changed event dismisses every
 * mounted instance (DungeonMapTracker re-reads onboardingState).
 */

import type { VNode } from 'preact';
import type { WindroseFeature } from '#types/settings/settings.types';

import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { FEATURE_DEFINITIONS } from '../../core/featureFlags';
import { Icon } from '../shared/Icon';
import {
  ONBOARDING_QUESTIONS,
  allFeaturesEnabled,
  mapAnswersToFeatures,
} from './onboardingQuestions';
import type { OnboardingAnswers } from './onboardingQuestions';

// Module-level latch: two side-by-side map blocks must not show two
// simultaneous surveys. First mount claims it; released on unmount.
let surveyClaimed = false;

const REVIEW_STEP = ONBOARDING_QUESTIONS.length;
const STEP_COUNT = ONBOARDING_QUESTIONS.length + 1;

interface PluginWithSettings {
  settings: {
    features?: Partial<Record<WindroseFeature, boolean>>;
    onboardingState?: string;
  };
  saveSettings(): Promise<void>;
}

const OnboardingSurvey = (): VNode | null => {
  const app = useApp();
  const [claimed] = useState<boolean>(() => {
    if (surveyClaimed) return false;
    surveyClaimed = true;
    return true;
  });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  // Seeded from the mapping when the review step is entered.
  const [reviewFlags, setReviewFlags] = useState<Record<WindroseFeature, boolean> | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    return () => {
      if (claimed) surveyClaimed = false;
    };
  }, [claimed]);

  if (!claimed) return null;

  const finish = (features: Record<WindroseFeature, boolean>): void => {
    if (closing) return;
    setClosing(true);
    // Let the fade-out play before the settings event unmounts us.
    window.setTimeout(() => {
      try {
        const plugin = app.plugins.plugins['windrose-md'] as unknown as PluginWithSettings | undefined;
        if (plugin != null) {
          plugin.settings.features = features;
          plugin.settings.onboardingState = 'done';
          void plugin.saveSettings();
        }
      } catch { /* plugin unavailable — overlay stays; nothing lost */ }
    }, 260);
  };

  const handleSkip = (): void => finish(allFeaturesEnabled());

  const handleFinish = (): void => finish(reviewFlags ?? mapAnswersToFeatures(answers));

  const goNext = (): void => {
    if (step === REVIEW_STEP - 1) {
      // Entering review: compute presets once; user tweaks from there.
      setReviewFlags(mapAnswersToFeatures(answers));
    }
    setStep(s => Math.min(s + 1, REVIEW_STEP));
  };

  const goBack = (): void => setStep(s => Math.max(s - 1, 0));

  const toggleOption = (questionId: string, optionId: string, multi: boolean): void => {
    setAnswers(prev => {
      const current = prev[questionId] ?? [];
      const selected = current.includes(optionId);
      let next: string[];
      if (multi) {
        next = selected ? current.filter(id => id !== optionId) : [...current, optionId];
      } else {
        next = selected ? [] : [optionId];
      }
      return { ...prev, [questionId]: next };
    });
  };

  const renderStepper = (): VNode => (
    <div className="windrose-onb-steps">
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <>
          <div className={`windrose-onb-step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}>
            <span className="windrose-onb-num">{i < step ? '✓' : i + 1}</span>
          </div>
          {i < STEP_COUNT - 1 && <div className="windrose-onb-sep" />}
        </>
      ))}
    </div>
  );

  const renderQuestion = (): VNode => {
    const q = ONBOARDING_QUESTIONS[step];
    const selected = answers[q.id] ?? [];
    return (
      <div className="windrose-onb-body">
        <div className="windrose-onb-prompt">{q.prompt}</div>
        {q.multi === true && <div className="windrose-onb-hint">Pick any that apply — or none to keep both.</div>}
        <div className="windrose-onb-options">
          {q.options.map(opt => (
            <button
              key={opt.id}
              className={`windrose-onb-option${selected.includes(opt.id) ? ' selected' : ''}`}
              onClick={() => toggleOption(q.id, opt.id, q.multi === true)}
            >
              <div className="windrose-onb-option-label">{opt.label}</div>
              <div className="windrose-onb-option-desc">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderReview = (): VNode => {
    const flags = reviewFlags ?? allFeaturesEnabled();
    return (
      <div className="windrose-onb-body">
        <div className="windrose-onb-prompt">Your Windrose setup</div>
        <div className="windrose-onb-hint">
          Toggle anything you like — you can change all of these anytime in Settings → Windrose → Features.
        </div>
        <div className="windrose-onb-features">
          {FEATURE_DEFINITIONS.map(def => (
            <label key={def.id} className="windrose-onb-feature-row">
              <input
                type="checkbox"
                checked={flags[def.id]}
                onChange={() => setReviewFlags({ ...flags, [def.id]: !flags[def.id] })}
              />
              <div className="windrose-onb-feature-text">
                <span className="windrose-onb-feature-label">{def.label}</span>
                <span className="windrose-onb-feature-desc">{def.desc}</span>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`windrose-onb-overlay${closing ? ' closing' : ''}`}>
      <div className="windrose-onb-card">
        <div className="windrose-onb-head">
          <div className="windrose-onb-title">
            <Icon icon="lucide-compass" size={18} />
            <span>Welcome to Windrose</span>
          </div>
          <button className="windrose-onb-skip" onClick={handleSkip} title="Skip — enable everything">
            Skip
          </button>
        </div>
        {renderStepper()}
        {step < REVIEW_STEP ? renderQuestion() : renderReview()}
        <div className="windrose-onb-foot">
          {step > 0 && (
            <button className="windrose-onb-btn" onClick={goBack}>Back</button>
          )}
          <div className="windrose-onb-foot-spacer" />
          {step < REVIEW_STEP ? (
            <button className="windrose-onb-btn mod-cta" onClick={goNext}>Continue</button>
          ) : (
            <button className="windrose-onb-btn mod-cta" onClick={handleFinish}>Start mapping</button>
          )}
        </div>
      </div>
    </div>
  );
};

export { OnboardingSurvey };
