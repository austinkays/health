import { useState, useEffect } from 'react';
import { Shield, ExternalLink, Leaf } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';

const CONSENT_KEY = 'salve:ai-consent';

export function hasAIConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'granted';
  } catch {
    return false;
  }
}

export function revokeAIConsent() {
  localStorage.removeItem(CONSENT_KEY);
}

export default function AIConsentGate({ children }) {
  const [consented, setConsented] = useState(() => hasAIConsent());

  if (consented) return children;

  const grant = () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    setConsented(true);
  };

  return (
    <div className="mt-2">
      <Card className="!border-salve-lav/30">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-salve-sage/15 flex items-center justify-center flex-shrink-0">
            <Leaf size={15} className="text-salve-sage" />
          </div>
          <h3 className="font-playfair text-base font-semibold text-salve-text m-0">Meet Sage</h3>
        </div>

        <p className="text-[13px] text-salve-textMid leading-relaxed mb-3">
          Sage is your health companion. To generate personalized insights, Sage sends parts of your health profile to a third-party AI provider&thinsp;&mdash;&thinsp;<strong className="text-salve-text">Google Gemini</strong> on the free plan or <strong className="text-salve-text">Anthropic Claude</strong> on Premium. This may include:
        </p>

        <ul className="text-[13px] text-salve-textMid leading-relaxed mb-3 list-disc pl-4 space-y-1">
          <li>Your name and location</li>
          <li>Medications, conditions, and allergies</li>
          <li>Recent vitals and journal entries</li>
          <li>Insurance plan name</li>
        </ul>

        <p className="text-[13px] text-salve-textMid leading-relaxed mb-4">
          Your data is sent over an encrypted connection and is not used to train AI models. You can revoke this consent at any time in Settings.
        </p>

        <div className="flex gap-2">
          <Button variant="lavender" onClick={grant} className="flex-1 justify-center">
            I Understand, Enable Sage
          </Button>
        </div>

        <p className="text-[10px] text-salve-textFaint italic text-center mt-3 leading-relaxed">
          Sage's suggestions are not medical advice. Always consult your healthcare providers.
        </p>
      </Card>
    </div>
  );
}
