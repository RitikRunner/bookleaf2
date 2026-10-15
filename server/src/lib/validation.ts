import type { z } from 'zod';
import { ValidationError } from './errors.js';

type InputLocation = 'body' | 'query' | 'params';

/** Validates untrusted request input, turning schema issues into a 400 with one entry per invalid field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, location: InputLocation): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: [location, ...issue.path.map(String)].join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
