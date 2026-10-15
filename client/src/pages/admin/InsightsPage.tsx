import { useAiMetrics } from '../../api/queries';
import type { AiUsageRow } from '../../api/types';
import { Card, CardHeader, ErrorNotice, Notice, PageHeader, PageLoader, Stat } from '../../components/ui';

const OPERATION_LABELS: Record<AiUsageRow['operation'], string> = { CLASSIFY: 'Triage', DRAFT: 'Drafted replies' };

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const usd = (value: number) => `$${value.toFixed(value < 0.01 ? 5 : 2)}`;

/** How the AI is performing: reliability, cost, and how often people had to correct it. */
export function InsightsPage() {
  const metrics = useAiMetrics();
  if (metrics.isPending) return <PageLoader />;
  if (metrics.error) return <ErrorNotice error={metrics.error} />;
  const { status, usage, classification, drafts } = metrics.data;
  const draftsSent = drafts.sentAsWritten + drafts.sentEdited;

  return (
    <>
      <PageHeader
        title="AI insights"
        subtitle={`Triage: ${status.models.classification} · Drafts: ${status.models.draft}. Costs are estimates at paid-tier list prices.`}
      />

      {!status.enabled && <Notice tone="warning">AI is switched off. Tickets are triaged by keyword rules and replies are written manually.</Notice>}
      {status.enabled && status.circuit === 'open' && (
        <Notice tone="warning">Recent AI calls failed, so calls are paused briefly. Triage falls back to keyword rules meanwhile.</Notice>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Triage quality" subtitle="How often admins changed what the AI decided" />
          <div className="grid grid-cols-2 gap-6 p-4">
            <Stat label="Category kept" value={percent(classification.categoryAgreementRate)} hint={`${classification.categoryCorrections} corrected`} />
            <Stat label="Priority corrections" value={classification.priorityCorrections} />
            <Stat label="Triaged by AI" value={classification.byAi} hint={`${classification.byRules} by keyword rules`} />
            <Stat label="Awaiting triage" value={classification.pending} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Drafted replies" subtitle="Whether AI drafts were useful as written" />
          <div className="grid grid-cols-2 gap-6 p-4">
            <Stat label="Drafts generated" value={drafts.generated} />
            <Stat label="Sent from a draft" value={draftsSent} />
            <Stat label="Sent as written" value={drafts.sentAsWritten} hint={draftsSent ? percent(drafts.sentAsWritten / draftsSent) : undefined} />
            <Stat label="Edited before sending" value={drafts.sentEdited} />
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Usage and cost" subtitle="Every model call is logged, including failures" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Operation</th>
                <th className="px-4 py-2.5 text-right">Calls</th>
                <th className="px-4 py-2.5 text-right">Failed</th>
                <th className="px-4 py-2.5 text-right">Avg latency</th>
                <th className="px-4 py-2.5 text-right">Tokens in / out</th>
                <th className="px-4 py-2.5 text-right">Est. cost</th>
                <th className="px-4 py-2.5 text-right">Per call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usage.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No AI calls yet.
                  </td>
                </tr>
              )}
              {usage.map((row) => (
                <tr key={row.operation}>
                  <td className="px-4 py-2.5 font-medium">{OPERATION_LABELS[row.operation]}</td>
                  <td className="px-4 py-2.5 text-right">{row.calls}</td>
                  <td className="px-4 py-2.5 text-right">{row.failures}</td>
                  <td className="px-4 py-2.5 text-right">{(row.avgLatencyMs / 1000).toFixed(1)}s</td>
                  <td className="px-4 py-2.5 text-right">
                    {row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">{usd(row.costUsd)}</td>
                  <td className="px-4 py-2.5 text-right">{usd(row.avgCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
