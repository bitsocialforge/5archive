import assert from 'node:assert/strict';
import { type Questions, validateQuestions } from '../client.mts';

export function required<T>(value: T | null | undefined): T {
  assert.ok(value !== undefined && value !== null, 'Expected fixture value to exist');
  return value;
}

export function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  return value as Record<string, unknown>;
}

export function jsonBody(init: RequestInit | undefined) {
  assert.ok(typeof init?.body === 'string', 'Expected a JSON request body');
  const value: unknown = JSON.parse(init.body);
  return record(value);
}

export function jevBody(init: RequestInit | undefined): Record<string, unknown> & { questions: Questions } {
  const value = jsonBody(init);
  const questions = value.questions;
  validateQuestions(questions);
  return { ...value, questions };
}
