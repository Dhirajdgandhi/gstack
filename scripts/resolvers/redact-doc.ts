/**
 * redact-doc — resolvers for the shared redaction docs + invocation bash.
 *
 *   {{REDACT_TAXONOMY_TABLE}}            → markdown table of the 3-tier taxonomy,
 *                                          derived from lib/redact-patterns so /spec
 *                                          and /cso never drift from the engine.
 *   {{REDACT_INVOCATION_BLOCK:<sink>}}   → the canonical scan-at-sink bash + prose
 *                                          for one enforcement point. <sink> is a
 *                                          hyphenated label: pre-codex, pre-issue,
 *                                          pre-archive, pre-pr-body, pre-pr-title,
 *                                          pre-commit.
 *
 * DRY: every skill writes one placeholder per enforcement point; UX/threshold
 * changes land here once. test/redact-doc-resolver.test.ts golden-pins the output.
 */
import type { TemplateContext } from './types';
import { PATTERNS, type Tier } from '../../lib/redact-patterns';

// Representative example/prefix per pattern for the human-readable table. Keeps
// lib/redact-patterns clean (no doc strings) while ensuring the recognizable
// prefixes (AKIA, ghp_, sk-ant-, sk-, BEGIN) appear in the generated docs.
const EXAMPLE: Record<string, string> = {
  'aws.access_key': 'AKIA…',
  'aws.secret_key': '40-char base64 near aws_secret_access_key',
  'github.pat': 'ghp_…',
  'github.oauth': 'gho_…',
  'github.server': 'ghs_…',
  'github.fine_grained': 'github_pat_…',
  'anthropic.key': 'sk-ant-…',
  'openai.key': 'sk-… / sk-proj-…',
  'sendgrid.key': 'SG.x.y',
  'stripe.secret': 'sk_live_…',
  'slack.token': 'xoxb-/xoxp-…',
  'slack.webhook': 'hooks.slack.com/services/…',
  'discord.webhook': 'discord.com/api/webhooks/…',
  'twilio.auth_token': '32-hex near an AC… SID',
  'pem.private_key': '-----BEGIN … PRIVATE KEY-----',
  'db.url_with_password': 'postgres://user:pw@host',
  'creds.basic_auth_url': 'https://user:pw@host',
  'stripe.publishable': 'pk_live_…',
  'google.api_key': 'AIza…',
  'jwt': 'eyJ….eyJ….sig',
  'env.kv': 'FOO_SECRET=<high-entropy>',
  'pii.email': 'name@host.tld',
  'pii.phone.e164': '+1 415 555 0123',
  'pii.ssn': '123-45-6789',
  'pii.cc': 'Luhn-valid 13-19 digits',
  'pii.ip_public': 'public IPv4',
  'pii.wallet': '0x… / bc1… / 1…',
  'internal.hostname': 'host.corp / host.internal',
  'internal.url_private': 'http://localhost:PORT/path',
  'legal.nda_marker': 'CONFIDENTIAL / UNDER NDA',
  'legal.named_criticism': 'negative judgment + a full name',
  'internal.user_path': '/Users/<name>/… , /home/<name>/…',
  'hygiene.todo': 'TODO(owner)',
};

const TIER_BLURB: Record<Tier, string> = {
  HIGH: 'HIGH — genuinely-secret credentials. Blocks dispatch/file/edit/commit.',
  MEDIUM:
    'MEDIUM — PII, legal/damaging, internal-leak, and high-FP credential-shaped ' +
    'patterns. AskUserQuestion to confirm (sterner on public repos); never auto-blocked.',
  LOW: 'LOW — surfaced as an FYI, never blocks.',
};

export function generateRedactTaxonomyTable(_ctx: TemplateContext): string {
  const out: string[] = [];
  for (const tier of ['HIGH', 'MEDIUM', 'LOW'] as Tier[]) {
    out.push(`**${TIER_BLURB[tier]}**`, '');
    out.push('| ID | Catches | Example |');
    out.push('|----|---------|---------|');
    for (const p of PATTERNS.filter((x) => x.tier === tier)) {
      out.push(`| \`${p.id}\` | ${p.description} | ${EXAMPLE[p.id] ?? '—'} |`);
    }
    out.push('');
  }
  out.push(
    'Calibration: a gate that cries wolf gets ignored, so context-variable / ' +
      'high-FP credential shapes (Stripe publishable `pk_live_`, Google `AIza`, ' +
      'JWTs, env-style `*_KEY=`) sit at MEDIUM, not HIGH. The full taxonomy lives ' +
      'in `lib/redact-patterns.ts` and this table is generated from it.',
  );
  return out.join('\n');
}

// ── Invocation block (scan-at-sink) ──────────────────────────────────────────

interface SinkSpec {
  /** What is being scanned, for the prose. */
  noun: string;
  /** What HIGH blocks, in this skill's verbs. */
  blockVerb: string;
}

const SINKS: Record<string, SinkSpec> = {
  'pre-codex': { noun: 'the spec body', blockVerb: 'dispatch to codex' },
  'pre-issue': { noun: "the issue body you're about to file", blockVerb: 'file the issue' },
  'pre-archive': { noun: 'the body about to be archived', blockVerb: 'write the archive' },
  'pre-pr-body': { noun: 'the composed PR body', blockVerb: 'create/edit the PR' },
  'pre-pr-title': { noun: 'the PR title', blockVerb: 'set the PR title' },
  'pre-commit': { noun: 'the generated docs about to be committed', blockVerb: 'commit' },
};

export function generateRedactInvocationBlock(ctx: TemplateContext, args?: string[]): string {
  const sinkLabel = args?.[0] ?? 'pre-issue';
  const sink = SINKS[sinkLabel] ?? SINKS['pre-issue'];
  const bin = `${ctx.paths.binDir}/gstack-redact`;

  return `#### Redaction scan — ${sinkLabel} (${sink.noun})

Run the shared redaction engine on the EXACT bytes that will be sent. Write the
content to a temp file, scan that file, and pass the SAME file downstream — never
scan a string then re-render it (that reopens a scan-vs-send gap).

\`\`\`bash
command -v bun >/dev/null 2>&1 || { echo "redaction scan skipped — bun not on PATH (install bun)"; }
# Resolve repo visibility once per skill run; cache it. Order: local config
# (~/.gstack, never committed) → gh → glab → unknown(=public-strict wording).
REDACT_VIS=$(~/.claude/skills/gstack/bin/gstack-config get redact_repo_visibility 2>/dev/null)
if [ -z "$REDACT_VIS" ]; then
  REDACT_VIS=$(gh repo view --json visibility -q .visibility 2>/dev/null | tr 'A-Z' 'a-z')
fi
if [ -z "$REDACT_VIS" ]; then
  REDACT_VIS=$(glab repo view -F json 2>/dev/null | grep -o '"visibility":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//' | tr 'A-Z' 'a-z')
fi
REDACT_VIS="\${REDACT_VIS:-unknown}"

REDACT_FILE=$(mktemp)
cat > "$REDACT_FILE" <<'REDACT_BODY_EOF'
<the exact ${sink.noun} goes here>
REDACT_BODY_EOF
REDACT_JSON=$(${bin} --from-file "$REDACT_FILE" --repo-visibility "$REDACT_VIS" --self-email "$(git config user.email 2>/dev/null)" --json)
REDACT_CODE=$?
\`\`\`

Then branch on \`$REDACT_CODE\`:

1. **Exit 3 (HIGH)** — print the findings table. Do NOT ${sink.blockVerb}. Tell the
   user to rotate the credential (a leaked secret is compromised) and redact at the
   source, then re-run. There is no skip flag for HIGH. Stop. Do not persist
   ${sink.noun} anywhere downstream.
2. **Exit 2 (MEDIUM)** — for each finding, AskUserQuestion (cluster identical ids;
   on a PUBLIC repo use sterner per-finding wording with no batch-acknowledge and
   no silent-proceed):
   - For the PII subset (\`pii.email\`/\`pii.phone.e164\`/\`pii.ssn\`/\`pii.cc\`) offer
     **Auto-redact** (re-run \`${bin} --from-file "$REDACT_FILE" --auto-redact <ids> --repo-visibility "$REDACT_VIS"\`,
     which prints the sanitized body + a diff; use that body as the new ${sink.noun}),
     **Edit manually**, or **Cancel**.
   - For non-PII MEDIUM (hostnames, IPs, NDA markers, demoted-credential shapes)
     offer **Proceed (acknowledged)** / **Edit** / **Cancel** — no auto-redact.
3. **Exit 0 (clean)** — proceed. Surface any \`WARN\` findings (tool-attributed-fence
   degrades) and \`LOW\` findings as a one-line FYI; they never block.

\`\`\`bash
rm -f "$REDACT_FILE"
\`\`\`

This is a guardrail, not airtight enforcement: a determined user can always bypass
it with direct \`gh\`/\`git\`. It catches accidents.`;
}
