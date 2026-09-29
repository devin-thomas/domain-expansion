import { z } from 'zod';
import { currencySchema, isValidDateOnly, nextOccurrence, renewalIntentSchema } from './domain.js';

export const AI_INPUT_MAX_BYTES = 8 * 1024;
export const AI_DRAFT_MAX = 25;
export const AI_OUTPUT_TOKENS = 8192;
export const AI_ATTEMPT_TIMEOUT_MS = 20_000;
export const AI_TOTAL_TIMEOUT_MS = 45_000;

export const providerDraftSchema = z
  .object({
    name: z.string().max(2000).nullable(),
    registrar: z.string().max(200).nullable(),
    expirationMonth: z.number().int().min(1).max(12).nullable(),
    expirationDay: z.number().int().min(1).max(31).nullable(),
    expirationYear: z.number().int().min(1990).max(2200).nullable(),
    expirationYearInferred: z.boolean(),
    billingDate: z.string().nullable(),
    renewalCostMinor: z.number().int().nonnegative().safe().nullable(),
    currency: currencySchema.nullable(),
    renewalIntent: renewalIntentSchema.nullable(),
    warnings: z.array(z.string().max(300)).max(8),
  })
  .strict();

export const providerResultSchema = z
  .object({
    drafts: z.array(providerDraftSchema).max(AI_DRAFT_MAX),
  })
  .strict();

export type ProviderDraft = z.infer<typeof providerDraftSchema>;

export interface ClientDraft {
  name: string | null;
  registrar: string | null;
  expirationDate: string | null;
  billingDate: string | null;
  renewalCostMinor: number | null;
  currency: string | null;
  suggestedCurrency: string | null;
  renewalIntent: 'renew' | 'let_expire' | null;
  warnings: string[];
  proposals: { field: string; reason: string }[];
}

export function materializeDraft(draft: ProviderDraft, today: string, accountCurrency: string): ClientDraft {
  const warnings = [...draft.warnings];
  const proposals: { field: string; reason: string }[] = [];
  let expirationDate: string | null = null;
  if (draft.expirationMonth && draft.expirationDay) {
    if (draft.expirationYear && !draft.expirationYearInferred) {
      const iso = `${String(draft.expirationYear).padStart(4, '0')}-${String(draft.expirationMonth).padStart(2, '0')}-${String(draft.expirationDay).padStart(2, '0')}`;
      expirationDate = isValidDateOnly(iso) ? iso : null;
      if (!expirationDate) warnings.push('The proposed expiration date is not a real calendar date.');
    } else {
      expirationDate = nextOccurrence(draft.expirationMonth, draft.expirationDay, today);
      if (expirationDate) {
        proposals.push({ field: 'expirationDate', reason: 'Year inferred as the next occurrence. Confirm it before adding.' });
      } else warnings.push('The month and day could not form a real date.');
    }
  }
  let billingDate: string | null = null;
  if (draft.billingDate) {
    if (isValidDateOnly(draft.billingDate)) billingDate = draft.billingDate;
    else warnings.push('The proposed billing date is not a real calendar date.');
  }
  if (!draft.currency) {
    proposals.push({ field: 'currency', reason: `Showing your account currency ${accountCurrency} as a default, not as an extracted fact.` });
  }
  return {
    name: draft.name?.trim() ? draft.name.trim() : null,
    registrar: draft.registrar,
    expirationDate,
    billingDate,
    renewalCostMinor: draft.renewalCostMinor,
    currency: draft.currency,
    suggestedCurrency: draft.currency ? null : accountCurrency,
    renewalIntent: draft.renewalIntent,
    warnings,
    proposals,
  };
}
