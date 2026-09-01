'use client';

import { useState, useEffect, useRef } from 'react';

interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate:   string; // YYYY-MM-DD
  onChange:  (start: string, end: string) => void;
}

// atWork brand accent (was BFT teal). Constant name kept so the rest of the
// BFT-cloned styling continues to reference a single value.
const TEAL = '#ccd404';        // colors.brand.primary — yellow button
const TEAL_HOVER = '#a3a903';  // colors.brand.primaryDark

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function formatDisplay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}/${months[d.getMonth()]}/${d.getFullYear()}`;
}

function getPresets(): { label: string; start: string; end: string }[] {
  const yesterday = daysAgo(1);
  const now = new Date();

  const lastMonthStart   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd     = new Date(now.getFullYear(), now.getMonth(), 0);
  const sameDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), lastMonthEnd.getDate()));

  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const sameDayLastYear = new Date(now.getFullYear() - 1, now.getMonth(), Math.min(now.getDate(), new Date(now.getFullYear() - 1, now.getMonth() + 1, 0).getDate()));

  const thisQuarterStart = startOfQuarter(now);
  const lastQuarterStart = startOfQuarter(new Date(thisQuarterStart.getFullYear(), thisQuarterStart.getMonth() - 1, 1));

  return [
    { label: 'Yesterday',              start: toIso(yesterday),        end: toIso(yesterday) },
    { label: 'Last 7 Days',            start: toIso(daysAgo(7)),        end: toIso(yesterday) },
    { label: 'Last 30 Days',           start: toIso(daysAgo(29)),       end: toIso(new Date()) },
    { label: 'Last 60 Days',           start: toIso(daysAgo(60)),       end: toIso(yesterday) },
    { label: 'This Month To Date',     start: toIso(startOfMonth(now)), end: toIso(yesterday) },
    { label: 'Last Month',             start: toIso(lastMonthStart),    end: toIso(lastMonthEnd) },
    { label: 'Last Month To Date',     start: toIso(lastMonthStart),    end: toIso(sameDayLastMonth) },
    { label: 'This Quarter To Date',   start: toIso(thisQuarterStart),  end: toIso(yesterday) },
    { label: 'Last Quarter To Date',   start: toIso(lastQuarterStart),  end: toIso(yesterday) },
    { label: 'This Year To Date',      start: toIso(startOfYear(now)),  end: toIso(yesterday) },
    { label: 'Last Year To Date',      start: toIso(lastYearStart),     end: toIso(sameDayLastYear) },
  ];
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [open, setOpen]           = useState(false);
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd,   setTempEnd]   = useState(endDate);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef   = useRef<HTMLInputElement>(null);

  // Sync temp state when props change externally
  useEffect(() => { setTempStart(startDate); }, [startDate]);
  useEffect(() => { setTempEnd(endDate); },     [endDate]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTempStart(startDate);
        setTempEnd(endDate);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, startDate, endDate]);

  const handlePreset = (start: string, end: string) => {
    onChange(start, end);
    setOpen(false);
  };

  const handleApply = () => {
    if (tempStart && tempEnd && tempStart <= tempEnd) {
      onChange(tempStart, tempEnd);
      setOpen(false);
    }
  };

  const handleCancel = () => {
    setTempStart(startDate);
    setTempEnd(endDate);
    setOpen(false);
  };

  const buttonLabel = `${formatDisplay(startDate)} – ${formatDisplay(endDate)}`;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          height: '36.5px',
          padding: '0 12px',
          border: `1px solid #D1D5DB`,
          borderRadius: 0,
          backgroundColor: '#fff',
          fontSize: '0.875rem',
          color: '#111',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: '0.8rem', color: '#666' }}>📅</span>
        {buttonLabel}
        <span style={{ fontSize: '0.65rem', color: '#999', marginLeft: 2 }}>▼</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          backgroundColor: '#fff',
          border: '1px solid #D1D5DB',
          borderRadius: 0,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 1000,
          width: 360,
          padding: '16px',
        }}>

          {/* Presets */}
          <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Presets
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {getPresets().map(({ label, start, end }) => (
              <button
                key={label}
                onClick={() => handlePreset(start, end)}
                onMouseEnter={() => setHoveredPreset(label)}
                onMouseLeave={() => setHoveredPreset(null)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  backgroundColor: hoveredPreset === label ? TEAL_HOVER : TEAL,
                  color: '#013E51',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid #E5E7EB', margin: '0 0 14px' }} />

          {/* Custom range */}
          <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Custom Range
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', marginBottom: 3 }}>Start Date</span>
              <div
                onClick={() => startInputRef.current?.showPicker()}
                style={{ cursor: 'pointer', width: '100%', height: '34px', border: '1px solid #D1D5DB', borderRadius: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', overflow: 'hidden' }}
              >
                <input
                  ref={startInputRef}
                  type="date"
                  value={tempStart}
                  onChange={e => setTempStart(e.target.value)}
                  style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '0 8px', fontSize: '0.8rem', boxSizing: 'border-box', cursor: 'pointer', backgroundColor: 'transparent' }}
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', marginBottom: 3 }}>End Date</span>
              <div
                onClick={() => endInputRef.current?.showPicker()}
                style={{ cursor: 'pointer', width: '100%', height: '34px', border: '1px solid #D1D5DB', borderRadius: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', overflow: 'hidden' }}
              >
                <input
                  ref={endInputRef}
                  type="date"
                  value={tempEnd}
                  onChange={e => setTempEnd(e.target.value)}
                  style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '0 8px', fontSize: '0.8rem', boxSizing: 'border-box', cursor: 'pointer', backgroundColor: 'transparent' }}
                />
              </div>
            </div>
          </div>

          {/* Apply / Cancel */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={handleCancel}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 500,
                backgroundColor: '#fff',
                color: '#333',
                border: '1px solid #D1D5DB',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 500,
                backgroundColor: TEAL,
                color: '#fff',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
