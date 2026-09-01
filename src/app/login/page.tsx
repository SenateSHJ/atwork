'use client';

/**
 * LoginPage — cloned from BFT's src/pages/LoginPage.tsx (2026-08-31).
 *
 * Structure is BFT verbatim (magic-link OTP, shouldCreateUser=false,
 * friendlyAuthError mapping, four-state state machine).
 *
 * Adapted for atWork:
 *   - Logo:  /atwork-logo.png (was BFT_blue_large.png)
 *   - Colours: atWork tokens (teal + yellow-green brand)
 *   - Product name: "atWork Dashboard"
 *   - Route framework: Next.js Image + supabaseBrowser client (was
 *     Vite <img> + supabase-js singleton)
 */

import { useState } from 'react';
import Image from 'next/image';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { colors, typography, spacing, borderRadius, shadow } from '@/tokens';

type State = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setState('sending');
    setError('');

    const { error: signInError } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (signInError) {
      console.error('[LoginPage] signInWithOtp failed:', signInError.message);
      setError(friendlyAuthError(signInError.message));
      setState('error');
    } else {
      setState('sent');
    }
  }

  // BFT's error-message mapping verbatim.
  function friendlyAuthError(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes('signups not allowed')) {
      return "That email address isn't in our system. Please contact your administrator if you need access.";
    }
    if (lower.includes('rate limit')) {
      return 'Too many sign-in attempts. Please wait a minute and try again.';
    }
    if (lower.includes('invalid') && lower.includes('email')) {
      return "That doesn't look like a valid email address. Please check and try again.";
    }
    return raw;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // atWork: teal-primary dark background rather than BFT's black.
        // Matches the atWork brand palette (colors.brand.secondaryDark
        // = darkest teal).
        backgroundColor: colors.brand.secondaryDark,
        fontFamily: typography.fontFamily.sans,
        padding: spacing.md,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: colors.background.card,
          border: `1px solid ${colors.border.default}`,
          borderRadius: borderRadius.xl,
          boxShadow: shadow.lg,
          padding: spacing['2xl'],
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: spacing.lg,
        }}
      >
        <Image
          src="/atwork-logo.png"
          alt="atWork"
          width={200}
          height={72}
          style={{ height: 'auto', width: 'auto', maxHeight: '72px', maxWidth: '200px', objectFit: 'contain', marginBottom: spacing.xs }}
          priority
        />

        <div style={{ textAlign: 'center' }}>
          <h1
            style={{
              fontSize: typography.fontSize['2xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              margin: 0,
            }}
          >
            atWork Dashboard
          </h1>
          <p
            style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
              marginTop: spacing.sm,
              marginBottom: 0,
              lineHeight: typography.lineHeight.normal,
            }}
          >
            Sign in with your invited email address.
          </p>
        </div>

        {state === 'sent' ? (
          <div
            style={{
              width: '100%',
              padding: spacing.md,
              backgroundColor: colors.status.successFaint,
              borderRadius: borderRadius.md,
              textAlign: 'center',
              fontSize: typography.fontSize.sm,
              color: colors.text.primary,
              lineHeight: typography.lineHeight.normal,
            }}
          >
            Check your inbox — a sign-in link has been sent to <strong>{email}</strong>.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: spacing.md }}
          >
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoFocus
              style={{
                width: '100%',
                padding: `${spacing.sm} ${spacing.md}`,
                border: `1px solid ${colors.border.default}`,
                borderRadius: borderRadius.md,
                fontSize: typography.fontSize.sm,
                color: colors.text.primary,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {state === 'error' && (
              <p
                style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.status.error,
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={state === 'sending' || !email.trim()}
              style={{
                width: '100%',
                padding: `14px ${spacing.md}`,
                // atWork brand teal for the primary CTA (parallel to
                // BFT's colors.ui.teal usage on the same button role).
                backgroundColor: colors.brand.secondary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: borderRadius.md,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                cursor: state === 'sending' ? 'not-allowed' : 'pointer',
                opacity: state === 'sending' || !email.trim() ? 0.65 : 1,
                transition: 'opacity 0.15s',
                letterSpacing: '0.01em',
              }}
            >
              {state === 'sending' ? 'Sending…' : 'View Dashboard'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
