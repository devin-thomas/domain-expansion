import { retryDueNotifications } from './admission.js';
import type { AppDeps } from './http.js';

export const RETRY_CRON_SCHEDULE = '45 14 * * *';

export interface RetryRun {
  requestId: string;
  source: 'vercel' | 'operator';
  schedule: typeof RETRY_CRON_SCHEDULE | null;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  scanned?: number;
  retried?: number;
  errorCode?: 'retry_failed';
}

export async function retryWithAudit(
  deps: Pick<AppDeps, 'store' | 'config' | 'mail' | 'now'>,
  requestId: string,
  source: RetryRun['source'],
  schedule: RetryRun['schedule'],
) {
  const started = deps.now();
  const timer = performance.now();
  // Fixed keys retain the latest provider and operator runs without an unbounded log.
  const path = `mailRetryRuns/${source}`;
  const run: RetryRun = { requestId, source, schedule, status: 'running', startedAt: started.toISOString() };
  await deps.store.transaction(async (tx) => {
    const current = await tx.get<RetryRun>(path);
    // A delayed start cannot replace evidence with an earlier start timestamp.
    if (!current || current.startedAt <= run.startedAt) tx.set(path, run);
  });

  const finish = async (outcome: Pick<RetryRun, 'status' | 'scanned' | 'retried' | 'errorCode'>) => {
    await deps.store.transaction(async (tx) => {
      const current = await tx.get<RetryRun>(path);
      // An older overlapping worker cannot overwrite a more recently started run.
      if (current?.requestId === requestId) {
        tx.set(path, { ...run, ...outcome, completedAt: deps.now().toISOString(), durationMs: Math.round(performance.now() - timer) });
      }
    });
  };

  let result: Awaited<ReturnType<typeof retryDueNotifications>>;
  try {
    result = await retryDueNotifications(deps.store, deps.config, deps.mail, started);
  } catch (error) {
    await finish({ status: 'failed', errorCode: 'retry_failed' });
    throw error;
  }
  await finish({ status: 'succeeded', ...result.body });
  return result;
}
