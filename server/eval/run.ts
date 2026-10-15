/**
 * Offline evaluation of the AI prompts against labelled BookLeaf scenarios (eval/cases.ts).
 *
 *   npm run eval                          classification + draft checks (needs GEMINI_API_KEY)
 *   npm run eval -- --rules               keyword-rules baseline only: no API key, no cost
 *   npm run eval -- --only drafts         one part only (classification | drafts), printed but not saved
 *   npm run eval -- --rpm 60              request pacing; the default suits the free tier (15/min per model)
 *
 * Uses the seeded database because the facts in each prompt come from the real dataset. Each case is written as
 * a temporary ticket, run through the same prompt builders the app uses, and deleted afterwards.
 * Usage is not written to the AI usage log, so eval runs don't skew the production cost dashboard.
 * Full runs are written to eval/RESULTS.md, including every drafted reply.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { env } from '../src/config/env.js';
import { getAiClient } from '../src/ai/client.js';
import { classificationRequest } from '../src/ai/classifier.js';
import { draftRequest, normalizeSignOff } from '../src/ai/drafter.js';
import { generateStructured, type CallStats } from '../src/ai/gateway.js';
import { CLASSIFICATION_PROMPT_VERSION } from '../src/ai/prompts/classification.js';
import { DRAFT_PROMPT_VERSION, findPlaceholders } from '../src/ai/prompts/draft.js';
import { applyPolicyFloors, classifyByRules, type Triage } from '../src/ai/rules.js';
import { loadTicketContext, type TicketContext } from '../src/ai/ticketContext.js';
import { prisma } from '../src/lib/prisma.js';
import { CLASSIFICATION_CASES, DRAFT_CASES, type ClassificationCase, type DraftCase } from './cases.js';

const { values: flags } = parseArgs({
  options: {
    rules: { type: 'boolean', default: false },
    only: { type: 'string' },
    rpm: { type: 'string', default: '12' },
  },
});
const CONCURRENCY = 2;
const RESULTS_URL = new URL('./RESULTS.md', import.meta.url);

const createdTicketIds: string[] = [];
const allStats: CallStats[] = [];

// Spaces out model calls so a run stays under the provider's per-minute request limit.
const minIntervalMs = 60_000 / Number(flags.rpm);
let nextCallAt = 0;
async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextCallAt - now);
  nextCallAt = Math.max(now, nextCallAt) + minIntervalMs;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function contextFor(scenario: { authorId: string; bookId: string | null; subject: string; description: string; category?: DraftCase['category'] }) {
  const ticket = await prisma.ticket.create({
    data: {
      authorId: scenario.authorId,
      bookId: scenario.bookId,
      subject: scenario.subject,
      description: scenario.description,
      category: scenario.category ?? null,
      aiStatus: 'COMPLETED', // keeps a running server's background sweep away from eval tickets
    },
  });
  createdTicketIds.push(ticket.id);
  const context = await loadTicketContext(ticket.id);
  if (!context) throw new Error(`Could not load context for ${ticket.id}`);
  return context;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface ClassificationResult {
  testCase: ClassificationCase;
  rules: Triage;
  ai?: Triage | { error: string };
}

const isCorrect = (testCase: ClassificationCase, triage: Triage) => ({
  category: testCase.expected.categories.includes(triage.category),
  priority: testCase.expected.priorities.includes(triage.priority),
});

async function runClassificationCase(testCase: ClassificationCase, useAi: boolean): Promise<ClassificationResult> {
  const context = await contextFor(testCase);
  const text = `${testCase.subject}\n${testCase.description}`;
  const floors = { text, payoutState: context.royalty.payoutState };
  const rules = applyPolicyFloors(classifyByRules(text), floors);
  if (!useAi) return { testCase, rules };

  try {
    await pace();
    // The production request, with a longer timeout for slow free-tier responses and no usage logging.
    const { output, stats } = await generateStructured({ ...classificationRequest(context), timeoutMs: 60_000, logUsage: false });
    allStats.push(stats);
    return { testCase, rules, ai: applyPolicyFloors(output, floors) };
  } catch (error) {
    return { testCase, rules, ai: { error: error instanceof Error ? error.message : String(error) } };
  }
}

function scoreClassification(results: ClassificationResult[], pick: (result: ClassificationResult) => Triage | { error: string } | undefined) {
  let category = 0;
  let priority = 0;
  let both = 0;
  for (const result of results) {
    const triage = pick(result);
    if (!triage || 'error' in triage) continue;
    const correct = isCorrect(result.testCase, triage);
    category += Number(correct.category);
    priority += Number(correct.priority);
    both += Number(correct.category && correct.priority);
  }
  return { category, priority, both, total: results.length };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

interface DraftResult {
  testCase: DraftCase;
  failures: string[];
  reply?: string;
}

/** Checks every draft must pass, whatever the scenario. */
function universalChecks(reply: string): string[] {
  const failures: string[] = [];
  const words = reply.split(/\s+/).filter(Boolean).length;
  if (!/^Hi [A-Z][\p{L}'-]*,/u.test(reply)) failures.push('does not open with "Hi <first name>,"');
  if (!/Warm regards,\s*\n\s*BookLeaf Author Support\s*$/.test(reply)) failures.push('missing the BookLeaf sign-off');
  if (!/\n\s*\n/.test(reply)) failures.push('no paragraph breaks (one wall of text)');
  if (words < 60 || words > 260) failures.push(`length ${words} words (expected 60-260)`);
  if (/\*\*|^#{1,6}\s|^\s*[-*•]\s/m.test(reply)) failures.push('uses Markdown or bullet symbols');
  if (findPlaceholders(reply).length > 2) failures.push('more than 2 [CONFIRM] placeholders');
  return failures;
}

async function runDraftCase(testCase: DraftCase): Promise<DraftResult> {
  const context: TicketContext = await contextFor(testCase);
  try {
    await pace();
    const { output, stats } = await generateStructured({ ...draftRequest(context), timeoutMs: 60_000, logUsage: false });
    const reply = normalizeSignOff(output.reply); // the same post-processing production applies
    allStats.push(stats);

    const failures = [
      ...universalChecks(reply),
      ...testCase.mustInclude.filter((pattern) => !pattern.test(reply)).map((pattern) => `missing ${pattern}`),
      ...(testCase.mustNotInclude ?? []).filter((pattern) => pattern.test(reply)).map((pattern) => `should not match ${pattern}`),
      ...(testCase.escalateTo.includes(output.escalateTo) ? [] : [`escalateTo ${output.escalateTo}, expected ${testCase.escalateTo.join(' or ')}`]),
    ];
    return { testCase, failures, reply };
  } catch (error) {
    return { testCase, failures: [`call failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const pct = (part: number, total: number) => `${part}/${total} (${Math.round((part / total) * 100)}%)`;
const label = (triage: Triage | { error: string } | undefined) =>
  !triage ? 'n/a' : 'error' in triage ? `error: ${triage.error.slice(0, 60)}` : `${triage.category} / ${triage.priority}`;

function report(classification: ClassificationResult[], drafts: DraftResult[], useAi: boolean): string {
  const rules = scoreClassification(classification, (result) => result.rules);
  const ai = scoreClassification(classification, (result) => result.ai);
  const totals = allStats.reduce(
    (sum, stats) => ({
      input: sum.input + stats.inputTokens + stats.cacheReadTokens,
      output: sum.output + stats.outputTokens,
      cost: sum.cost + stats.costMicroUsd,
      latency: sum.latency + stats.latencyMs,
    }),
    { input: 0, output: 0, cost: 0, latency: 0 },
  );

  const lines = [
    '# AI evaluation results',
    '',
    `Run: ${new Date().toISOString()} · classification model \`${env.AI_CLASSIFY_MODEL}\` (${CLASSIFICATION_PROMPT_VERSION}) · draft model \`${env.AI_DRAFT_MODEL}\` (${DRAFT_PROMPT_VERSION})`,
    '',
  ];

  if (classification.length) {
    lines.push(
      '## Classification',
      '',
      '| | Category | Priority | Both |',
      '|---|---|---|---|',
      ...(useAi ? [`| AI (after policy floors) | ${pct(ai.category, ai.total)} | ${pct(ai.priority, ai.total)} | ${pct(ai.both, ai.total)} |`] : []),
      `| Keyword rules (fallback) | ${pct(rules.category, rules.total)} | ${pct(rules.priority, rules.total)} | ${pct(rules.both, rules.total)} |`,
      '',
    );
  }

  const misses = classification.filter((result) => {
    const triage = useAi ? result.ai : result.rules;
    if (!triage || 'error' in triage) return true;
    const correct = isCorrect(result.testCase, triage);
    return !correct.category || !correct.priority;
  });
  if (misses.length) {
    lines.push(`Misses (${useAi ? 'AI' : 'rules'}):`, '', '| Case | Expected | Got |', '|---|---|---|');
    for (const miss of misses) {
      const expected = `${miss.testCase.expected.categories.join(' or ')} / ${miss.testCase.expected.priorities.join(' or ')}`;
      lines.push(`| ${miss.testCase.id} | ${expected} | ${label(useAi ? miss.ai : miss.rules)} |`);
    }
    lines.push('');
  }

  if (drafts.length) {
    const passed = drafts.filter((draft) => draft.failures.length === 0).length;
    lines.push('## Drafts', '', `${pct(passed, drafts.length)} scenarios passed every check.`, '', '| Scenario | Result |', '|---|---|');
    for (const draft of drafts) lines.push(`| ${draft.testCase.id} | ${draft.failures.length ? draft.failures.join('; ') : 'pass'} |`);
    lines.push('', '<details><summary>Drafted replies</summary>', '');
    for (const draft of drafts) {
      lines.push(`### ${draft.testCase.id}`, '', `> ${draft.testCase.description}`, '', '```text', draft.reply ?? '(no reply)', '```', '');
    }
    lines.push('</details>', '');
  }

  if (allStats.length) {
    lines.push(
      '## Cost',
      '',
      `${allStats.length} model calls · ${totals.input.toLocaleString()} input / ${totals.output.toLocaleString()} output tokens · ` +
        `$${(totals.cost / 1_000_000).toFixed(4)} total · average latency ${Math.round(totals.latency / allStats.length)} ms`,
      '',
    );
  }
  return lines.join('\n');
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const useAi = !flags.rules && getAiClient() !== null;
  if (!flags.rules && !useAi) {
    console.log('AI is not configured (set GEMINI_API_KEY): running the keyword-rules baseline only.\n');
  }

  const runClassification = flags.only !== 'drafts';
  const runDrafts = useAi && flags.only !== 'classification';

  try {
    const classification = runClassification
      ? await mapWithConcurrency(CLASSIFICATION_CASES, CONCURRENCY, (testCase) => runClassificationCase(testCase, useAi))
      : [];
    const drafts = runDrafts ? await mapWithConcurrency(DRAFT_CASES, CONCURRENCY, runDraftCase) : [];
    const markdown = report(classification, drafts, useAi);
    console.log(markdown);
    // Only a complete AI run replaces the saved results.
    if (useAi && runClassification && runDrafts) {
      await writeFile(RESULTS_URL, `${markdown}\n`);
      console.log(`Saved to eval/RESULTS.md`);
    }
  } finally {
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
