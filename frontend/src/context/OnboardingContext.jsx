import { createContext, useContext, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext';

const OnboardingContext = createContext();

export function OnboardingProvider({ children }) {
  const { isAuthenticated } = useContext(AuthContext);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [wizardWhiteDone, setWizardWhiteDone] = useState(
    () => localStorage.getItem('wizard_white_seen') === '1'
  );
  const [wizardBlackDone, setWizardBlackDone] = useState(
    () => localStorage.getItem('wizard_black_seen') === '1'
  );
  const [wizardGamesDone, setWizardGamesDone] = useState(
    () => localStorage.getItem('wizard_games_seen') === '1'
  );
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('onboarding_complete') === '1'
  );

  // Auto-trigger tour on first login
  useEffect(() => {
    if (isAuthenticated && !localStorage.getItem('guidance_seen') && !tourActive) {
      startTour();
    }
  }, [isAuthenticated, tourActive]);

  // Listen for wizard completion events from pages
  useEffect(() => {
    const handleWizardComplete = (e) => {
      const { detail } = e;
      if (detail === 'white') {
        setWizardWhiteDone(true);
      } else if (detail === 'black') {
        setWizardBlackDone(true);
      } else if (detail === 'games') {
        setWizardGamesDone(true);
      }
    };

    window.addEventListener('wizard-complete', handleWizardComplete);
    return () => window.removeEventListener('wizard-complete', handleWizardComplete);
  }, []);

  function startTour() {
    setTourActive(true);
    setTourStep(0);
  }

  function advanceTour() {
    setTourStep((s) => s + 1);
  }

  function backTour() {
    setTourStep((s) => Math.max(0, s - 1));
  }

  function skipTour() {
    localStorage.setItem('guidance_seen', '1');
    localStorage.setItem('onboarding_complete', '1');
    setOnboardingComplete(true);
    setTourActive(false);
  }

  function completeTour() {
    localStorage.setItem('guidance_seen', '1');
    localStorage.setItem('onboarding_complete', '1');
    setOnboardingComplete(true);
    setTourActive(false);
  }

  function skipWizardDuringTour() {
    // When user skips wizard during tour, advance to next step
    advanceTour();
  }

  const value = {
    tourActive,
    tourStep,
    wizardWhiteDone,
    wizardBlackDone,
    wizardGamesDone,
    onboardingComplete,
    startTour,
    advanceTour,
    backTour,
    skipTour,
    completeTour,
    skipWizardDuringTour,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
