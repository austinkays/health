// ── Universal Import ──
// Big, prominent drop zone that auto-detects the file's source app
// and routes to the appropriate parser's ImportWizard. If detection
// fails, shows a "pick from list" fallback.
//
// Handles 13+ app formats: Clue, Bearable, Visible, Daylio, Libre,
// mySugr, Sleep Cycle, Natural Cycles, Strava, Samsung, Garmin,
// Fitbit Takeout, Google Fit.

import { useState, useCallback, useRef } from 'react';
import { Upload, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import Card from './Card';
import ImportWizard from './ImportWizard';
import { detectImportFile } from '../../utils/importDetect';

export default function UniversalImport({ data, reloadData, onManualFallback }) {
  const [stage, setStage] = useState('idle'); // idle, detecting, matched, unknown
  const [detected, setDetected] = useState(null);
  const [droppedFile, setDroppedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [filename, setFilename] = useState('');
  const fileRef = useRef(null);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    setFilename(file.name);
    setStage('detecting');
    try {
      const match = await detectImportFile(file);
      if (match) {
        setDetected(match);
        setDroppedFile(file);
        setStage('matched');
      } else {
        setStage('unknown');
      }
    } catch (err) {
      console.error('[UniversalImport] detection failed:', err);
      setStage('unknown');
    }
  }, []);

  const reset = () => {
    setStage('idle');
    setDetected(null);
    setDroppedFile(null);
    setFilename('');
  };

  // Drag handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleClick = () => fileRef.current?.click();
  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  // ── MATCHED: render ImportWizard with the detected parser ──
  if (stage === 'matched' && detected && droppedFile) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-salve-sage" />
            <span className="text-ui-sm text-salve-textMid font-montserrat">
              Detected: <strong className="text-salve-sage">{detected.label}</strong>
            </span>
          </div>
          <button
            onClick={reset}
            className="text-ui-xs text-salve-textFaint bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors font-montserrat"
          >
            Change
          </button>
        </div>
        <ImportWizard
          parser={detected.module}
          data={data}
          reloadData={reloadData}
          initialFile={droppedFile}
        />
      </div>
    );
  }

  // ── UNKNOWN: show helpful error + manual fallback ──
  if (stage === 'unknown') {
    return (
      <Card className="!p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-salve-amber shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-ui-md text-salve-text font-montserrat font-medium mb-1">
              Couldn't auto-detect this file
            </p>
            <p className="text-ui-sm text-salve-textMid font-montserrat mb-3">
              <span className="text-salve-textFaint">{filename}</span> doesn't match any known format.
              Pick the source app manually from the list below, or try a different file.
            </p>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="text-ui-sm text-salve-lav bg-salve-lav/10 border border-salve-lav/30 rounded-lg px-3 py-1.5 font-montserrat cursor-pointer hover:bg-salve-lav/20 transition-colors"
              >
                Try another file
              </button>
              {onManualFallback && (
                <button
                  onClick={() => { reset(); onManualFallback(); }}
                  className="text-ui-sm text-salve-textMid bg-transparent border border-salve-border rounded-lg px-3 py-1.5 font-montserrat cursor-pointer hover:border-salve-lav/40 hover:text-salve-lav transition-colors"
                >
                  Pick from list
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // ── DETECTING: spinner ──
  if (stage === 'detecting') {
    return (
      <Card className="!p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-2">
          <Loader2 size={22} className="animate-spin text-salve-sage" />
          <p className="text-ui-sm text-salve-textMid font-montserrat">
            Analyzing <span className="text-salve-text">{filename}</span>…
          </p>
        </div>
      </Card>
    );
  }

  // ── IDLE: the big drop zone ──
  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      aria-label="Drop any health data export to import"
      className={`
        flex flex-col items-center justify-center gap-2 p-fluid-lg rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200
        ${dragOver
          ? 'border-salve-lav bg-salve-lav/10 scale-[1.01] shadow-lg'
          : 'border-salve-border bg-salve-card2/30 hover:border-salve-lav/50 hover:bg-salve-card2/60'
        }
      `}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xml,.zip,.json,.txt"
        onChange={handleChange}
        className="hidden"
      />
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
        dragOver ? 'bg-salve-lav/20' : 'bg-salve-lav/10'
      }`}>
        <Upload
          size={22}
          className={`transition-colors ${dragOver ? 'text-salve-lav' : 'text-salve-lav/70'}`}
        />
      </div>
      <span className={`text-ui-lg font-medium font-montserrat transition-colors ${dragOver ? 'text-salve-lav' : 'text-salve-text'}`}>
        {dragOver ? 'Drop your file here' : 'Drop any export file to import'}
      </span>
      <span className="text-ui-xs text-salve-textFaint font-montserrat text-center leading-relaxed max-w-[440px]">
        Salve auto-detects files from Clue, Bearable, Visible, Daylio, Libre, mySugr,
        Strava, Sleep Cycle, Samsung Health, Garmin, Fitbit, Google Fit, and more
      </span>
    </div>
  );
}
