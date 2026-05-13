# Verified Dish Tales: AI Development Instructions

**Last Updated**: 2026-05-13  
**Version**: 1.0.0

## Critical Directive: Senior Architect Development & Security Protocol

This file establishes the non-negotiable architectural and security standards for all AI-assisted development on the Verified Dish Tales platform. Adherence to these directives is mandatory to maintain the integrity of the immutable ledger system.

---

## I. SECURITY & DATA INTEGRITY (Mandatory)

### Authentication & Authorization
- **Zero-Trust Access**: ALL SQL operations (SELECT, INSERT, UPDATE, DELETE) must be explicitly filtered by `auth.uid()` and verified via table joins for ownership.
- **RLS Enforcement**: Never suggest bypassing Supabase Row-Level Security (RLS) policies.
- **Service Role Anti-Pattern**: The AI MUST NOT suggest or implement `service_role` overrides for Supabase operations. This is a critical security anti-pattern.

### Data Validation & Input Sanitization
- **Zod Enforcement**: The AI MUST NOT allow any data inputs that bypass Zod-validated schemas.
- **Immutable Storage**: XSS prevention via script tag stripping MUST occur before storage (see `sanitize()` in `src/lib/schemas.ts`).
- **Length Constraints**: All string inputs MUST have both min and max length constraints enforced at both Zod schema and database CHECK constraint levels.

### Database Integrity Guarantees
- **Immutable Records**: Tables storing audit trails (e.g., `reviews`, `owner_responses`) MUST have RLS policies that prohibit UPDATE and DELETE operations.
- **Atomicity**: Single-use state transitions (e.g., marking a reward as `used_at`) MUST use database CHECK constraints to prevent double-writes.
- **Ownership Verification**: Any mutation affecting a business must verify that `auth.uid()` owns the business via the `business_profile_membership` table.

---

## II. ARCHITECTURAL EXCELLENCE

### Type Safety & No Runtime Surprises
- **Strict Typing**: The use of the `any` type is **STRICTLY PROHIBITED**. All data structures must use explicit TypeScript interfaces.
- **Inference Over Assertion**: Prefer `z.infer<typeof schema>()` for type derivation rather than manual type aliases.
- **Error Boundaries**: Server functions MUST catch and transform errors into user-friendly messages before responding.

### Three-State Logic in Protected Components
Every protected/sensitive component must explicitly handle three states:
1. **Loading**: Use `Skeleton` loaders from `@/components/ui/skeleton`
2. **Authorized**: Display the protected content
3. **Unauthorized**: Display the `AccessDenied` component from `@/components/ui/AccessDenied`

**Example**:
```tsx
if (isLoading) return <Skeleton className="h-24" />;
if (!user) return <AccessDenied />;
return <ProtectedContent />;
```

### Code Tagging for Non-Trivial Logic
- **`// @business-logic`**: Use this tag for reward/permission-sensitive handling (e.g., the 5-star review reward mint, double-tap prevention).
- **`// @complexity-explanation`**: Use this tag for non-trivial state transitions or conditionals that deserve explanation.

### DRY & Component Reuse
- **Pre-Search**: Before creating new components, the AI MUST search `@/components/ui` and `@/lib` for reusable assets.
- **Shadcn/ui Foundation**: The project uses shadcn/ui. Check for existing Button, Input, Textarea, Dialog, etc., before creating duplicates.

---

## III. UI/UX BEHAVIOR

### Streaming Text for AI Features
- **Token-by-Token Rendering**: The AI MUST implement Streaming Text (token-by-token) for AI-generated summaries to reduce perceived latency.
- **Visual Feedback**: Display a pulsing cursor or animated indicator while streaming.
- **Stop Button**: Always provide a "Stop" button mid-stream to allow users to cancel long generation tasks.

**Implementation Pattern**:
```tsx
const [text, setText] = useState("");
const [streaming, setStreaming] = useState(false);
const abortRef = useRef<AbortController | null>(null);

async function run() {
  setText("");
  setStreaming(true);
  const ac = new AbortController();
  abortRef.current = ac;
  try {
    const res = await fetch("/api/summarize", { signal: ac.signal });
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setText((t) => t + decoder.decode(value, { stream: true }));
    }
  } finally {
    setStreaming(false);
  }
}

function stop() {
  abortRef.current?.abort();
}
```

### Mobile-First Sequential Disclosure
- **Single-Column Layout**: Present information in a turn-by-turn layout that users can process without spatial clutter.
- **Positional Convention for Trust**:
  - Owner Responses: Left-aligned, Light Gray bubbles
  - Patron Reviews: Right-aligned, Branded Color bubbles
- **Verified Badges**: Always display a "Verified" badge next to restaurateur names and timestamps to build trust.

---

## IV. FEATURE-SPECIFIC REQUIREMENTS

### Immutable Owner Responses
- **Constraint Enforcement**: Database MUST include `CHECK (char_length(content) >= 10 AND char_length(content) <= 500)` on the `content` column.
- **RLS Policy**: `owner_responses` table MUST have RLS policies that:
  - Allow INSERT only if `auth.uid()` matches `business_id` via `business_profile_membership` join
  - Allow SELECT publicly
  - Deny UPDATE and DELETE for all roles
- **Frontend Validation**: Use Zod for real-time validation; disable submit button if input falls outside 10–500 character range.

### Verified Rewards Single-Use Lifecycle
- **Status States**:
  - `Active`: `used_at IS NULL AND current_timestamp < expiry_date`
  - `Used`: Permanent state with `used_at` populated
  - `Expired`: Dynamic filter where `current_timestamp > expiry_date`
- **Immutability Guard**: Database CHECK constraint MUST ensure `used_at` can only transition from NULL to a timestamp (never modified after).
- **Double-Tap Prevention**: Redemption MUST fail if `used_at` is already populated.

### 5-Star Review Reward Mint
- **Automatic Trigger**: When a patron submits a 5-star review, automatically mint a single-use reward valid for 14 days.
- **Expiry Calculation**: `expiry_date = now() + 14 * 24 * 60 * 60 * 1000` milliseconds
- **Business Assignment**: Reward `business_id` MUST match the review's `business_id`.

---

## V. EDGE FUNCTION & SERVER FUNCTION PATTERNS

### Edge Function Gatekeeping
All write operations to the ledger (reviews, responses, rewards) MUST pass through server functions (TanStack Start) that:
1. Validate input with Zod **before** any database operation
2. Check ownership via auth context
3. Return user-friendly error messages
4. Never expose internal SQL or database structure

### Never Use Service Role in Client Code
- The `SUPABASE_SERVICE_ROLE_KEY` must **never** appear in client-side code or be suggested in prompts.
- Server functions run in a trusted context and use the user's auth token via middleware.

---

## VI. VALIDATION & INTEGRITY CHECKLIST

- [ ] **Pre-Transaction Validation**: Zod schema check enforced within server functions
- [ ] **Length Hard-Coding**: `z.string().min(10).max(500)` applied consistently
- [ ] **Database Constraints**: CHECK constraints mirror Zod min/max rules
- [ ] **Type Safety**: 100% TypeScript coverage; no `any` types
- [ ] **XSS Sanitization**: Script tags stripped before storage
- [ ] **RLS Enforcement**: All tables have appropriate RLS policies
- [ ] **Ownership Verification**: Mutations verify `auth.uid()` ownership
- [ ] **Error Handling**: Server functions catch and transform errors

---

## VII. DEPLOYMENT & VERSION CONTROL WORKFLOW

### Development Cycle
1. **Plan Mode First**: Use 'Plan Mode' for 70% of development. Only "Implement the Plan" once the AI has correctly outlined the RLS and Zod logic.
2. **Visual Edits for UI**: Use the 'Visual Edit' tool for all text, color, and spacing tweaks to save credits and ensure precision.
3. **Code Review Mindset**: Before committing, verify RLS policies, Zod schemas, and ownership checks are in place.

### The "I am frustrated" Fallback
If the AI enters a bug loop (2+ failed fixes), use the prompt:
> "I am frustrated. We are in a loop. Switch to Plan Mode, review the last three errors, and propose a clean-slate refactor."

### Version Pinning Strategy
- Pin every stable feature (e.g., "Verified Rewards v1.0", "Immutable Owner Responses v1.0") to create a reliable fallback before moving to the next module.
- Use git tags: `git tag -a v1.0.0-immutable-responses -m "Immutable Owner Responses system"`

### Pre-Flight Security Scan
Run before every production deployment:
- [ ] **RLS Policy Audit**: Verify all tables have appropriate RLS policies (no UPDATE/DELETE on immutable tables)
- [ ] **Zod Schema Coverage**: Check all server function inputs are validated
- [ ] **Auth Middleware**: Confirm `requireSupabaseAuth` middleware is applied to sensitive functions
- [ ] **No Service Role**: Search codebase for `service_role` usage (should be zero)
- [ ] **Type Safety**: Run `npm run lint` and verify no `any` types
- [ ] **Secret Management**: Confirm all env variables are in `.env` or Lovable Cloud secrets

---

## VIII. DECISION LOG FOR FUTURE DEVELOPMENT

Record major architectural decisions here:

| Date | Feature | Decision | Rationale |
|------|---------|----------|-----------|
| 2026-05-13 | Immutable Ledger | RLS policies prohibit UPDATE/DELETE on reviews and owner_responses | Prevent post-submission tampering; immutability is core to trust |
| 2026-05-13 | Verified Rewards | Single-use enforced via CHECK constraint on `used_at` | Prevent double-spending; database-level atomicity |
| 2026-05-13 | Auth Model | Zero-Trust with ownership joins | Eliminate accidental cross-tenant data exposure |

---

## IX. QUICK REFERENCE

### Critical File Locations
- **Schemas**: `src/lib/schemas.ts` (Zod definitions, sanitization)
- **Server Functions**: `src/lib/ledger.functions.ts` (immutable mutations)
- **Auth Middleware**: `src/integrations/supabase/auth-middleware.ts`
- **Database Migrations**: `supabase/migrations/` (RLS policies, schema)
- **AI-Facing Instructions**: `.lovable/instructions.md` (this file)

### Common Patterns to Reuse
```tsx
// Three-state loading pattern
if (isLoading) return <Skeleton className="h-24 rounded-lg" />;
if (!user) return <AccessDenied />;
return <Content />;

// Server function with Zod
export const myFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Use userId in ownership check
    return { ok: true };
  });

// Ownership check in SQL
.eq("author_id", userId)  // Always filter by auth.uid()
.select("id, content")
```

---

**End of Instructions**. Violation of these directives should be treated as a blocking issue in code review.
