import Link from 'next/link';
import { colors, typography, spacing } from '@/tokens';

export default function UnauthorizedPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background.page,
      fontFamily: typography.fontFamily.sans,
      padding: spacing.md,
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: '480px' }}>
        <h1 style={{
          fontSize: typography.fontSize['2xl'],
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary,
          margin: 0,
        }}>Not authorised</h1>
        <p style={{
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          marginTop: spacing.md,
          lineHeight: typography.lineHeight.normal,
        }}>
          Your account is signed in but does not have access to this dashboard.
          Contact your administrator if this looks wrong.
        </p>
        <Link href="/login" style={{
          display: 'inline-block',
          marginTop: spacing.lg,
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.brand.secondary,
          color: '#FFFFFF',
          textDecoration: 'none',
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
        }}>Back to sign in</Link>
      </div>
    </div>
  );
}
