'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { colors, typography, borderRadius, shadow, zIndex } from '../../tokens';

interface Props {
  label:    string;
  options:  string[];
  value:    string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export function SearchableSingleSelect({ label, options, value, onChange, disabled }: Props) {
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState('');
  const [dropPos, setDropPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef               = useRef<HTMLButtonElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest('[data-sss-dropdown]')
      ) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Calculate portal position when opening
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase()),
  );

  function select(opt: string) {
    onChange(opt);
    setOpen(false);
    setSearch('');
  }

  const isActive    = !!value;
  const displayText = isActive ? value : label;

  const dropdown = open && dropPos ? createPortal(
    <div
      data-sss-dropdown
      style={{
        position:        'fixed',
        top:             dropPos.top,
        left:            dropPos.left,
        minWidth:        dropPos.width,
        width:           'max-content',
        maxWidth:        280,
        zIndex:          zIndex.dropdown,
        backgroundColor: colors.background.card,
        border:          `1px solid ${colors.border.default}`,
        borderRadius:    borderRadius.md,
        boxShadow:       shadow.lg,
        display:         'flex',
        flexDirection:   'column',
        overflow:        'hidden',
      }}
    >
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

      <div style={{ overflowY: 'auto', maxHeight: 220 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '8px 12px', fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
            No results
          </div>
        ) : filtered.map(opt => {
          const selected = opt === value;
          return (
            <div
              key={opt}
              onMouseDown={e => { e.preventDefault(); select(opt); }}
              style={{
                padding:         '7px 12px',
                fontSize:        typography.fontSize.sm,
                color:           selected ? colors.brand.primary : colors.text.primary,
                backgroundColor: selected ? colors.brand.primaryFaint : 'transparent',
                cursor:          'pointer',
                fontWeight:      selected ? typography.fontWeight.medium : typography.fontWeight.normal,
              }}
              onMouseEnter={e => {
                if (!selected) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.background.panel;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = selected ? colors.brand.primaryFaint : 'transparent';
              }}
            >
              {opt}
            </div>
          );
        })}
      </div>

      {value && (
        <div style={{ borderTop: `1px solid ${colors.border.default}`, padding: '6px 10px' }}>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); }}
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
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={containerRef} style={{ display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
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
          backgroundColor: disabled
            ? colors.background.panel
            : isActive
            ? colors.brand.primaryFaint
            : colors.background.card,
          cursor:          disabled ? 'not-allowed' : 'pointer',
          whiteSpace:      'nowrap',
          userSelect:      'none',
          opacity:         disabled ? 0.6 : 1,
          transition:      'border-color 0.15s, background-color 0.15s',
          maxWidth:        170,
          overflow:        'hidden',
          textOverflow:    'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {disabled ? 'Loading…' : displayText}
        </span>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.5 }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {dropdown}
    </div>
  );
}
