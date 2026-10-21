// Development-only client. Never import this module into application code.
import { resolveJevSettings, JevConfigError } from './config.mts';

export type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, string> };
export type NoulQuestion = { type: 'noul'; instructions: string; criteria?: Partial<Record<'true' | 'false', string>> };
export type ScoreQuestion = { type: 'score'; instructions: string; criteria: string[] };
export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;
export type Questions = Record<string, Question>;
export type ChoiceAnswer = { choice: string; confidence: number; probabilities: Record<string, number> };
export type NoulAnswer = { noul: number };
export type ScoreAnswer = { score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, string> };
export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;
export type AnswerFor<Q> = Q extends ChoiceQuestion ? ChoiceAnswer : Q extends NoulQuestion ? NoulAnswer : Q extends ScoreQuestion ? ScoreAnswer : Answer;
export type Usage = { input_tokens?: number; output_tokens?: number };
export type JevResponse<Q extends Questions = Questions> = { model: string; answers: { [K in keyof Q]: AnswerFor<Q[K]> }; usage: Usage };
export type JevRequest<Q extends Questions = Questions> = { state: unknown; questions: Q };
export interface JevClientOptions {
  live?: boolean; apiKey?: string; model?: string; maxRequests?: number; maxCalls?: number;
  maxInputBytes?: number; maxInputTokens?: number; maxCostUsd?: number; timeoutMs?: number;
  deadlineMs?: number; fetchImpl?: typeof globalThis.fetch;
}
export type JevClient = ReturnType<typeof createJevClient>;

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const INPUT_USD_PER_MILLION = 0.042;
// Per-value half-cent rounding slack, not a tolerance for the combined weighted sum.
// A live synthetic response is consistent with independently rounded Score/probabilities.
export const SCORE_ROUNDING_TOLERANCE = 0.005 + 1e-9;

export class JevError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = 'JevError';
    this.code = code;
  }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(code: string): never {
  throw new JevError(code);
};
const probability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const criterion = (value: unknown): value is string => typeof value === 'string' && value.length <= 2000;

export function validateQuestions(questions: unknown): asserts questions is Questions {
  if (!object(questions) || Object.keys(questions).length < 1 || Object.keys(questions).length > 20) fail('invalid_questions');
  for (const [id, question] of Object.entries(questions)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(id) ||
      !object(question) ||
      (question.type !== 'choice' && question.type !== 'noul' && question.type !== 'score') ||
      typeof question.instructions !== 'string' ||
      question.instructions.length > 4000
    )
      fail('invalid_questions');
    if (question.type === 'noul') {
      if (
        Object.hasOwn(question, 'criteria') &&
        (!object(question.criteria) || Object.entries(question.criteria).some(([key, value]) => !['true', 'false'].includes(key) || !criterion(value)))
      )
        fail('invalid_questions');
      continue;
    }
    if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10 || Array.from(question.criteria).some((value) => !criterion(value)))
        fail('invalid_questions');
      continue;
    }
    if (!object(question.criteria)) fail('invalid_questions');
    const criteria = question.criteria;
    const choices = Object.keys(criteria);
    if (
      choices.length < 2 ||
      choices.length > 50 ||
      choices.some((key) => !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || !criterion(criteria[key]))
    )
      fail('invalid_questions');
  }
}

function distribution(answer: Record<string, unknown>, keys: string[]): { confidence: number; probabilities: Record<string, number>; values: number[] } {
  if (!probability(answer.confidence) || !object(answer.probabilities) || Object.keys(answer.probabilities).length !== keys.length) fail('invalid_response');
  const probabilities: Record<string, number> = {};
  for (const key of keys) {
    const value = answer.probabilities[key];
    if (!Object.hasOwn(answer.probabilities, key) || !probability(value)) fail('invalid_response');
    probabilities[key] = value;
  }
  const values = Object.values(probabilities);
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.001) fail('invalid_response');
  return { confidence: answer.confidence, probabilities, values };
}

export function scoreMatchesProbabilities(score: unknown, probabilities: unknown) {
  if (!Array.isArray(probabilities) || probabilities.length < 2 || probabilities.length > 10) return false;
  const values: unknown[] = Array.from(probabilities);
  if (!values.every(probability) || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > values.length - 1) return false;
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.001) return false;
  // The observed response is consistent with independently rounded two-decimal
  // values. Only those get intervals; more precise values remain exact.
  // Require a feasible underlying distribution summing to one, without changing
  // any returned value or treating arbitrary score differences as acceptable.
  const slack = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) <= 1e-9 ? SCORE_ROUNDING_TOLERANCE : 0;
  const lower = values.map((value) => Math.max(0, value - slack(value)));
  const upper = values.map((value) => Math.min(1, value + slack(value)));
  const remaining = 1 - lower.reduce((sum, value) => sum + value, 0);
  if (remaining < -1e-9 || upper.reduce((sum, value) => sum + value, 0) < 1 - 1e-9) return false;
  const extremum = (descending: boolean) => {
    let mass = Math.max(0, remaining);
    let weighted = lower.reduce((sum, value, index) => sum + index * value, 0);
    for (let position = 0; position < values.length; position++) {
      const index = descending ? values.length - 1 - position : position;
      const added = Math.min(mass, upper[index]! - lower[index]!);
      weighted += index * added;
      mass -= added;
    }
    return weighted;
  };
  return score + slack(score) >= extremum(false) - 1e-9 && score - slack(score) <= extremum(true) + 1e-9;
}

export function validateResponse<Q extends Questions>(data: unknown, questions: Q, model: string): JevResponse<Q> {
  if (!object(data) || data.model !== model || !object(data.answers) || Object.keys(data.answers).length !== Object.keys(questions).length) fail('invalid_response');
  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const answer = data.answers[id];
    if (!Object.hasOwn(data.answers, id) || !object(answer) || answer.type !== question.type) fail('invalid_response');
    if (question.type === 'noul') {
      if (!probability(answer.noul)) fail('invalid_response');
      answers[id] = { noul: answer.noul };
      continue;
    }
    if (question.type === 'score') {
      const levels = question.criteria.map((_, index) => String(index));
      const parsed = distribution(answer, levels);
      if (typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > levels.length - 1 || !object(answer.legend) || Object.keys(answer.legend).length !== levels.length || !scoreMatchesProbabilities(answer.score, parsed.values)) fail('invalid_response');
      const legend: Record<string, string> = {};
      for (const level of levels) {
        const value = answer.legend[level];
        if (!Object.hasOwn(answer.legend, level) || typeof value !== 'string' || value !== question.criteria[Number(level)]) fail('invalid_response');
        legend[level] = value;
      }
      answers[id] = { score: answer.score, confidence: parsed.confidence, probabilities: parsed.probabilities, legend };
      continue;
    }
    const choices = Object.keys(question.criteria);
    const parsed = distribution(answer, choices);
    if (typeof answer.choice !== 'string' || !choices.includes(answer.choice) || parsed.probabilities[answer.choice]! < Math.max(...parsed.values)) fail('invalid_response');
    answers[id] = { choice: answer.choice, confidence: parsed.confidence, probabilities: parsed.probabilities };
  }
  const usage: Usage = {};
  const rawUsage = object(data.usage) ? data.usage : {};
  for (const field of ['input_tokens', 'output_tokens'] as const) {
    const value = rawUsage[field];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) usage[field] = value;
  }
  // Every requested key has been checked against its question discriminant above.
  return { model, answers: answers as JevResponse<Q>['answers'], usage };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) fail('invalid_response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256_000) fail('response_too_large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createJevClient({
  live = false,
  apiKey,
  model,
  maxRequests = 20,
  maxCalls = maxRequests,
  maxInputBytes = 60_000,
  maxInputTokens = 300_000,
  maxCostUsd = 0.02,
  timeoutMs = 8000,
  deadlineMs = 120_000,
  fetchImpl = globalThis.fetch,
}: JevClientOptions = {}) {
  if (
    ![maxCalls, maxInputBytes, maxInputTokens, timeoutMs, deadlineMs].every((n) => Number.isSafeInteger(n) && n > 0) ||
    maxCalls > 1000 ||
    maxInputBytes > 128_000 ||
    timeoutMs > 30_000 ||
    deadlineMs > 600_000 ||
    !Number.isFinite(maxCostUsd) ||
    maxCostUsd <= 0 ||
    maxCostUsd > 10
  )
    fail('invalid_limits');
  const started = Date.now();
  let ready = false;
  const totals = { requests: 0, inputTokens: 0, outputTokens: 0, usageMissing: 0, reservedInputTokens: 0 };
  function stats() {
    const knownCostSubtotalUsd = (totals.inputTokens * INPUT_USD_PER_MILLION) / 1e6;
    return {
      ...totals,
      knownCostSubtotalUsd,
      estimatedCostUsd: totals.usageMissing ? null : knownCostSubtotalUsd,
      reservedMaxCostUsd: (totals.reservedInputTokens * INPUT_USD_PER_MILLION) / 1e6,
      priceUsdPerMillionInputTokens: INPUT_USD_PER_MILLION,
    };
  }
  function assertReady() {
    if (!live) fail('live_not_enabled');
    if (!ready) {
      try {
        ({ apiKey, model } = resolveJevSettings({ apiKey, model }));
      } catch (error) {
        if (error instanceof JevConfigError) fail(error.code);
        throw error;
      }
      ready = true;
    }
    return { model };
  }
  async function ask<Q extends Questions>({ state, questions }: JevRequest<Q>) {
    assertReady();
    if (apiKey === undefined || model === undefined) fail('configuration_unavailable');
    const token = apiKey.trim();
    validateQuestions(questions);
    let body;
    try {
      body = JSON.stringify({ model, state, questions });
    } catch {
      fail('invalid_state');
    }
    if (body.includes(token)) fail('secret_in_input');
    const bytes = Buffer.byteLength(body);
    if (bytes > maxInputBytes) fail('input_too_large');
    // Reserve one token per UTF-8 byte plus framing, including failed calls. This is deliberately
    // conservative, not a billing guarantee; actual usage remains separate and may be unavailable.
    const reserved = bytes + 1024;
    if (
      totals.requests >= maxCalls ||
      totals.reservedInputTokens + reserved > maxInputTokens ||
      ((totals.reservedInputTokens + reserved) * INPUT_USD_PER_MILLION) / 1e6 > maxCostUsd
    )
      fail('budget_exhausted');
    const remaining = deadlineMs - (Date.now() - started);
    if (remaining <= 0) fail('deadline_exceeded');
    totals.requests++;
    totals.usageMissing++;
    totals.reservedInputTokens += reserved;
    const before = Date.now();
    try {
      const response = await fetchImpl(JEV_ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
      });
      if (!response.ok) fail(response.status === 429 ? 'provider_throttled' : `provider_http_${response.status}`);
      const result = validateResponse(await readBoundedJson(response), questions, model);
      if (result.usage.input_tokens !== undefined) {
        totals.inputTokens += result.usage.input_tokens;
        totals.usageMissing--;
      }
      totals.outputTokens += result.usage.output_tokens || 0;
      return { ...result, latencyMs: Date.now() - before };
    } catch (error) {
      if (error instanceof JevError) throw error;
      fail(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'provider_timeout' : 'provider_unavailable');
    }
  }
  return { ask, stats, assertReady };
}
