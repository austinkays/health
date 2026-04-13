import { useState, useEffect, useRef } from 'react';
import { Phone, MessageSquare, ShieldAlert, Heart, X } from 'lucide-react';

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

const RESOURCES = {
  mental: {
    icon: Heart,
    title: 'You are not alone',
    subtitle: 'If you\'re in crisis, please reach out, help is available right now.',
    items: [
      { label: '988 Suicide & Crisis Lifeline', action: 'tel:988', actionLabel: 'Call 988', secondary: 'sms:988', secondaryLabel: 'Text 988', desc: 'Free, confidential, 24/7 support' },
      { label: 'Crisis Text Line', action: 'sms:741741&body=HELLO', actionLabel: 'Text HOME to 741741', desc: 'Free crisis counseling via text' },
      { label: 'SAMHSA Helpline', action: 'tel:1-800-662-4357', actionLabel: 'Call 1-800-662-4357', desc: 'Free substance abuse and mental health referrals, 24/7' },
      { label: 'The Trevor Project', action: 'tel:1-866-488-7386', actionLabel: 'Call 1-866-488-7386', secondary: 'sms:678-678&body=START', secondaryLabel: 'Text START to 678-678', desc: 'Crisis support for LGBTQ+ young people, 24/7' },
    ],
  },
  medical: {
    icon: ShieldAlert,
    title: 'Medical emergency',
    subtitle: 'If you or someone near you needs immediate medical help:',
    items: [
      { label: 'Emergency Services', action: 'tel:911', actionLabel: 'Call 911', desc: 'For life-threatening emergencies' },
      { label: 'Poison Control', action: 'tel:1-800-222-1222', actionLabel: 'Call 1-800-222-1222', desc: 'For poisoning or overdose questions' },
    ],
  },
  safety: {
    icon: ShieldAlert,
    title: 'You deserve to be safe',
    subtitle: 'If you\'re in an unsafe situation, confidential help is available.',
    items: [
      { label: 'National DV Hotline', action: 'tel:1-800-799-7233', actionLabel: 'Call 1-800-799-7233', secondary: 'sms:22233&body=START', secondaryLabel: 'Text START to 22233', desc: '24/7 confidential support' },
      { label: 'Emergency Services', action: 'tel:911', actionLabel: 'Call 911', desc: 'If you are in immediate danger' },
    ],
  },
};

export default function CrisisModal({ type, onClose }) {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  const resource = RESOURCES[type] || RESOURCES.mental;
  const Icon = resource.icon;

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    // Focus the close button on mount
    setTimeout(() => closeRef.current?.focus(), 60);
  }, []);

  // Block Escape key, must use the explicit close button
  useEffect(() => {
    const block = (e) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', block);
    return () => window.removeEventListener('keydown', block);
  }, []);

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    panel.addEventListener('keydown', trap);
    return () => panel.removeEventListener('keydown', trap);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      // NOT dismissible by clicking outside, user must use the close button
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={resource.title}
        className={`relative bg-salve-card border-2 border-salve-rose/40 rounded-2xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto px-6 py-6 shadow-2xl transition-transform duration-200 ${visible ? 'scale-100' : 'scale-95'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-salve-rose/15 mb-3">
            <Icon size={24} className="text-salve-rose" />
          </div>
          <h2 className="font-playfair text-xl font-semibold text-salve-text tracking-tight">
            {resource.title}
          </h2>
          <p className="text-[15px] text-salve-textMid font-montserrat mt-1.5 leading-relaxed">
            {resource.subtitle}
          </p>
        </div>

        {/* Resource cards */}
        <div className="space-y-3 mb-5">
          {resource.items.map((item, i) => (
            <div key={i} className="bg-salve-bg border border-salve-border rounded-xl p-4">
              <p className="text-[14px] font-semibold text-salve-text font-montserrat mb-1">
                {item.label}
              </p>
              <p className="text-[14px] text-salve-textFaint font-montserrat mb-3">
                {item.desc}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={item.action}
                  className="inline-flex items-center gap-1.5 bg-salve-rose text-white text-[15px] font-semibold font-montserrat rounded-lg px-4 py-2 no-underline hover:bg-salve-roseDim transition-colors"
                >
                  <Phone size={14} />
                  {item.actionLabel}
                </a>
                {item.secondary && (
                  <a
                    href={item.secondary}
                    className="inline-flex items-center gap-1.5 bg-salve-rose/15 text-salve-rose text-[15px] font-semibold font-montserrat rounded-lg px-4 py-2 no-underline hover:bg-salve-rose/25 transition-colors"
                  >
                    <MessageSquare size={14} />
                    {item.secondaryLabel}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Reassurance + close */}
        <div className="text-center">
          <p className="text-[14px] text-salve-textFaint font-montserrat mb-4 leading-relaxed">
            Your journal entry will still be saved. This message appears because
            we care about your safety.
          </p>
          <button
            ref={closeRef}
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 bg-salve-card border border-salve-border text-salve-textMid hover:text-salve-text text-[15px] font-montserrat rounded-xl px-5 py-2.5 transition-colors cursor-pointer"
          >
            <X size={14} />
            I&apos;m okay, close this
          </button>
        </div>
      </div>
    </div>
  );
}
