import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useSettings } from '../store/settings';
import { ONBOARDING_DONE, onboardingStep, type OnboardingStep } from '../model/onboarding';
import { createSampleProject } from '../model/sample';
import { replaceScene } from './fileActions';
import { Icon } from './icons';

interface Tip {
  target: string;
  /** Which side of the target the bubble sits on. */
  side: 'right' | 'top' | 'below-left';
  text: string;
}

const TIPS: Record<Exclude<OnboardingStep, 3>, Tip> = {
  0: { target: '.add-btn', side: 'right', text: 'Start with a person: click + and pick Person.' },
  1: {
    target: '.phase-switch',
    side: 'top',
    text: 'Drag the person to a spot. Then click End and drag them again: they will walk there during the shot.',
  },
  2: { target: 'button[aria-label="Play"]', side: 'below-left', text: 'Press ▶ (or Space) to watch your film.' },
};

/**
 * Three first-run tips, each beside the control it is about. A tip goes away
 * when its step is done; "Skip tips" ends them for good.
 */
export function Onboarding() {
  const step = useSettings((s) => s.onboarding);
  const setStep = useSettings((s) => s.setOnboarding);
  const project = useStore((s) => s.project);
  const playing = useStore((s) => !!s.playback);
  const taking = useStore((s) => !!s.take);
  const [played, setPlayed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playing) setPlayed(true);
  }, [playing]);

  useEffect(() => {
    const next = onboardingStep(step, project, played);
    if (next !== step) setStep(next);
  }, [step, project, played, setStep]);

  const tip = step === ONBOARDING_DONE ? null : TIPS[step as Exclude<OnboardingStep, 3>];

  // Follow the target control (it can move when the window resizes).
  useEffect(() => {
    if (!tip) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      const target = document.querySelector(tip.target)?.getBoundingClientRect();
      if (!el) return;
      if (!target) {
        el.style.opacity = '0';
        return;
      }
      el.style.opacity = '1';
      const gap = 14;
      let x = 0;
      let y = 0;
      if (tip.side === 'right') {
        x = target.right + gap;
        y = target.top + target.height / 2 - el.offsetHeight / 2;
      } else if (tip.side === 'top') {
        x = target.left + target.width / 2 - el.offsetWidth / 2;
        y = target.top - gap - el.offsetHeight;
      } else {
        x = target.right - el.offsetWidth;
        y = target.bottom + gap;
      }
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.dataset.side = tip.side;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [tip]);

  if (!tip || playing || taking) return null;
  return (
    <div className="floating tip" ref={ref} role="note">
      <span className="tip-step">{step + 1} / 3</span>
      <p>{tip.text}</p>
      <div className="tip-actions">
        {step === 0 && (
          <button className="text-btn" onClick={() => replaceScene(createSampleProject())}>
            Or open the sample scene
          </button>
        )}
        <button className="text-btn dim" onClick={() => setStep(ONBOARDING_DONE)}>
          Skip tips
        </button>
      </div>
      <button
        className="icon-btn ghost tip-close"
        aria-label="Next tip"
        title="Got it"
        onClick={() => setStep((step + 1) as OnboardingStep)}
      >
        <Icon.close />
      </button>
    </div>
  );
}
