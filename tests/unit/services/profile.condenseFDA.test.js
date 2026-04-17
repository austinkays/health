import { describe, it, expect } from 'vitest';
import { firstSentence, fdaBullet, condenseFDA } from '../../../src/services/profile.js';

describe('firstSentence (sanity — import wiring)', () => {
  it('returns empty for empty input', () => {
    expect(firstSentence('', 100)).toBe('');
  });

  it('stops at the first period', () => {
    expect(firstSentence('First. Second.', 100)).toBe('First.');
  });
});

describe('fdaBullet', () => {
  it('returns empty for empty / null input', () => {
    expect(fdaBullet('', 100)).toBe('');
    expect(fdaBullet(null, 100)).toBe('');
  });

  it('strips numbered "1 INDICATIONS AND USAGE" prefix', () => {
    expect(fdaBullet('1 INDICATIONS AND USAGE ADDERALL XR is indicated for ADHD.', 200))
      .toBe('ADDERALL XR is indicated for ADHD.');
  });

  it('strips "2 DOSAGE AND ADMINISTRATION" prefix', () => {
    expect(fdaBullet('2 DOSAGE AND ADMINISTRATION Initiate with 25mg/day.', 200))
      .toBe('Initiate with 25mg/day.');
  });

  it('strips unnumbered "ADVERSE REACTIONS:" prefix', () => {
    expect(fdaBullet('ADVERSE REACTIONS: Most common are headache and nausea.', 200))
      .toBe('Most common are headache and nausea.');
  });

  it('does not strip short all-caps acronyms like MRI from normal prose', () => {
    expect(fdaBullet('MRI showed lesions in the temporal lobe.', 200))
      .toBe('MRI showed lesions in the temporal lobe.');
  });

  it('does not strip short all-caps acronyms like HIV from normal prose', () => {
    expect(fdaBullet('HIV positive patients should consult their provider.', 200))
      .toBe('HIV positive patients should consult their provider.');
  });

  it('truncates with ellipsis when longer than the limit', () => {
    const out = fdaBullet('A'.repeat(300), 50);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(out.length).toBe(50);
  });
});

describe('condenseFDA — existing branches (regression)', () => {
  const existingFda = {
    boxed_warning: ['Risk of respiratory depression'],
    contraindications: ['Do not use with MAO inhibitors'],
  };
  const existingOut = condenseFDA(existingFda);

  it('still outputs boxed warning', () => {
    expect(existingOut).toContain('boxed warning');
  });

  it('still outputs contraindications', () => {
    expect(existingOut).toContain('contraindications');
  });
});

describe('condenseFDA — expanded fields (indications / dosage / precautions)', () => {
  const richFda = {
    boxed_warning: ['Risk of respiratory depression with opioid use'],
    indications: ['1 INDICATIONS AND USAGE TRAMADOL is indicated for the management of moderate to moderately severe pain in adults.'],
    dosage: ['2 DOSAGE AND ADMINISTRATION Initiate treatment with 25 mg/day in the morning and titrate upward.'],
    contraindications: ['Do not use with MAO inhibitors'],
    precautions: ['5 WARNINGS AND PRECAUTIONS Serotonin syndrome may occur with concomitant serotonergic drug use.'],
    drug_interactions: ['Increased risk with SSRIs'],
    adverse_reactions: ['Most common adverse reactions are dizziness, nausea, constipation, headache, and somnolence.'],
    pregnancy: ['May cause neonatal opioid withdrawal syndrome.'],
    overdosage: ['Symptoms include respiratory depression'],
    storage: ['Store at room temperature'],
  };
  const richOut = condenseFDA(richFda);

  it('adds "used for:" for indications field', () => {
    expect(richOut).toContain('used for:');
  });

  it('adds "dosing:" for dosage field', () => {
    expect(richOut).toContain('dosing:');
  });

  it('adds "precautions:" for precautions field', () => {
    expect(richOut).toContain('precautions:');
  });

  it('strips the "1 INDICATIONS AND USAGE" header through fdaBullet', () => {
    expect(richOut).toContain('TRAMADOL is indicated');
    expect(richOut).not.toContain('1 INDICATIONS AND USAGE');
  });

  it('strips other numbered section headers', () => {
    expect(richOut).not.toContain('2 DOSAGE AND ADMINISTRATION');
    expect(richOut).not.toContain('5 WARNINGS AND PRECAUTIONS');
  });

  it('never feeds overdosage or storage to Sage', () => {
    expect(richOut).not.toContain('overdosage:');
    expect(richOut).not.toContain('storage:');
  });

  it('preserves existing branches (boxed warning / contraindications / interactions / side effects / pregnancy)', () => {
    expect(richOut).toContain('boxed warning:');
    expect(richOut).toContain('contraindications:');
    expect(richOut).toContain('interactions:');
    expect(richOut).toContain('side effects:');
    expect(richOut).toContain('pregnancy:');
  });
});
