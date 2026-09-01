// Roles for atWork. Cloned from BFT's src/auth/types.ts (2026-08-31),
// scoped down: BFT has hq / agency / studio / internal because it
// serves multi-tenant fitness studios; atWork is a single-tenant
// dashboard for SSHJ staff, so only 'internal' is meaningful here.
// Kept as a union rather than a literal so future roles slot in
// without a type refactor.
export type UserRole = 'internal';

export interface AuthUser {
  id:    string;
  email: string;
  role:  UserRole;
}
