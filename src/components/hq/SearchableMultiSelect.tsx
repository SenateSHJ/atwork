'use client';

import { useState, useRef, useEffect } from 'react';
import { colors, typography, borderRadius, shadow, zIndex } from '../../tokens';

interface Props {
  label:    string;
  options:  string[];
  value:    string[];
  onChange: (vals: string[]) => void;
}

export function SearchableMultiSelect({ label, options, value, onChange }: Props) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  }

  function toggleAll() {
    onChange(value.length === options.length ? [] : [...options]);
  }

  const isActive = value.length > 0;
  const displayText = isActive
    ? (value.length === 1 ? value[0] : `${value.length} selected`)
    : label;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) setSearch(''); }}
        style={{
          display:         'inline-flex',
          alignItems:      'center',
          gap:             6,
          height:          36,
          padding:         '0 10px',
          border:          `1px solid ${isActive ? colors.brand.primary : colors.border.default}`,
          borderRadius:    borderRadius.sm,
          fontSize:        typography.fontSize.sm,
          fontWeight:      isActive ? typography.fontWeight.medium : typography.fontWeight.normal,
          color:           isActive ? colors.brand.primary : colors.text.primary,
          backgroundColor: isActive ? colors.brand.primaryFaint : colors.background.card,
          cursor:          'pointer',
          whiteSpace:      'nowrap',
          userSelect:      'none',
          transition:      'border-color 0.15s, background-color 0.15s',
        }}
      >
        <span>{displayText}</span>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.5 }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:        'absolute',
          top:             'calc(100% + 4px)',
          left:            0,
          zIndex:          zIndex.dropdown,
          backgroundColor: colors.background.card,
          border:          `1px solid ${colors.border.default}`,
          borderRadius:    borderRadius.md,
          boxShadow:       shadow.lg,
          minWidth:        '100%',
          width:           'max-content',
          maxWidth:        300,
          display:         'flex',
          flexDirection:   'column',
          overflow:        'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 8px 4px', borderBottom: `1px solid ${colors.border.default}` }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                width:           '100%',
                border:          `1px solid ${colors.border.default}`,
                borderRadius:    borderRadius.sm,
                padding:         '5px 8px',
                fontSize:        typography.fontSize.sm,
                color:           colors.text.primary,
                outline:         'none',
                boxSizing:       'border-box',
                backgroundColor: colors.background.page,
              }}
            />
          </div>

          {/* Select all row */}
          <div
            onMouseDown={e => { e.preventDefault(); toggleAll(); }}
            style={{
              padding:         '7px 12px',
              fontSize:        typography.fontSize.sm,
              color:           colors.text.secondary,
              cursor:          'pointer',
              display:         'flex',
              alignItems:      'center',
              gap:             8,
              borderBottom:    `1px solid ${colors.border.default}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.background.panel; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
          >
            <Checkbox checked={value.length === options.length && options.length > 0} />
            <span style={{ fontWeight: typography.fontWeight.medium }}>
              {value.length === options.length && options.length > 0 ? 'Deselect all' : 'Select all'}
            </span>
          </div>

          {/* Options */}
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 12px', fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
                No results
              </div>
            ) : filtered.map(opt => {
              const selected = value.includes(opt);
              return (
                <div
                  key={opt}
                  onMouseDown={e => { e.preventDefault(); toggle(opt); }}
                  style={{
                    padding:         '7px 12px',
                    fontSize:        typography.fontSize.sm,
                    color:           selected ? colors.brand.primary : colors.text.primary,
                    backgroundColor: selected ? colors.brand.primaryFaint : 'transparent',
                    cursor:          'pointer',
                    display:         'flex',
                    alignItems:      'center',
                    gap:             8,
                  }}
                  onMouseEnter={e => {
                    if (!selected) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.background.panel;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = selected ? colors.brand.primaryFaint : 'transparent';
                  }}
                >
                  <Checkbox checked={selected} />
                  {opt}
                </div>
              );
            })}
          </div>

          {/* Clear footer */}
          {value.length > 0 && (
            <div style={{ borderTop: `1px solid ${colors.border.default}`, padding: '6px 10px' }}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onChange([]); }}
                style={{
                  fontSize:   typography.fontSize.xs,
                  color:      colors.text.secondary,
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  padding:    0,
                }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span style={{
      width:           14,
      height:          14,
      border:          `2px solid ${checked ? colors.brand.primary : colors.border.strong}`,
      borderRadius: 0,
      backgroundColor: checked ? colors.brand.primary : 'transparent',
      flexShrink:      0,
      display:         'inline-flex',
      alignItems:      'center',
      justifyContent:  'center',
    }}>
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  );
}
