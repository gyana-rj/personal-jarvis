import { describe, it, expect } from 'vitest';
import { toGeminiParameters, toFunctionDeclaration } from '../bridge/llm/schema.ts';

const FORBIDDEN = ['$schema', '$ref', '$defs', 'definitions', 'additionalProperties', 'default', 'examples', 'patternProperties'];
const keys = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keys(x, out); }
  return out;
};

describe('toGeminiParameters', () => {
  it('strips fields Gemini rejects and uppercases types', () => {
    const p = toGeminiParameters({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        calendarId: { type: 'string', default: 'primary', description: 'Which calendar' },
        maxResults: { type: 'integer', minimum: 1, maximum: 50, format: 'int32' },
        url: { type: 'string', format: 'uri' },
      },
      required: ['calendarId'],
    });
    expect(p).toEqual({
      type: 'OBJECT',
      properties: {
        calendarId: { type: 'STRING', description: 'Which calendar' },
        maxResults: { type: 'INTEGER', minimum: 1, maximum: 50, format: 'int32' },
        url: { type: 'STRING' },
      },
      required: ['calendarId'],
    });
    for (const k of FORBIDDEN) expect(keys(p).has(k)).toBe(false);
  });

  it('inlines $ref/$defs and guards against recursion', () => {
    const p = toGeminiParameters({
      type: 'object',
      $defs: { Attendee: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] }, Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } } },
      properties: { attendees: { type: 'array', items: { $ref: '#/$defs/Attendee' } }, tree: { $ref: '#/$defs/Node' } },
    });
    expect(p.properties.attendees.items.properties.email.type).toBe('STRING');
    expect(p.properties.tree.properties.next).toEqual({ type: 'STRING' });
    expect(keys(p).has('$ref')).toBe(false);
  });

  it('turns "X or null" unions into nullable X', () => {
    const p = toGeminiParameters({
      type: 'object',
      properties: { a: { anyOf: [{ type: 'string' }, { type: 'null' }] }, b: { type: ['integer', 'null'] }, c: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
    });
    expect(p.properties.a).toEqual({ type: 'STRING', nullable: true });
    expect(p.properties.b).toEqual({ type: 'INTEGER', nullable: true });
    expect(p.properties.c.anyOf).toHaveLength(2);
  });

  it('handles enums, const, arrays without items, and drops required keys that do not exist', () => {
    const p = toGeminiParameters({
      type: 'object',
      properties: { mode: { enum: ['a', 'b'] }, kind: { const: 'x' }, tags: { type: 'array' }, n: { enum: [1, 2] } },
      required: ['mode', 'ghost'],
    });
    expect(p.properties.mode).toEqual({ type: 'STRING', enum: ['a', 'b'] });
    expect(p.properties.kind.enum).toEqual(['x']);
    expect(p.properties.tags.items).toEqual({ type: 'STRING' });
    expect(p.properties.n.enum).toEqual(['1', '2']);
    expect(p.required).toEqual(['mode']);
  });

  it('returns undefined for argument-less tools (Gemini rejects empty OBJECT schemas)', () => {
    expect(toGeminiParameters({ type: 'object' })).toBeUndefined();
    expect(toGeminiParameters({ type: 'object', properties: {} })).toBeUndefined();
    expect(toGeminiParameters(undefined)).toBeUndefined();
    expect(toFunctionDeclaration({ name: 'now', description: 'time', parameters: { type: 'object' } })).toEqual({ name: 'now', description: 'time' });
  });
});
