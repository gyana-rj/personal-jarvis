/**
 * MCP tool inputSchema (JSON Schema) -> Gemini function-declaration `parameters` (OpenAPI subset).
 * Gemini rejects keywords like $schema, additionalProperties, default and $ref, so we inline refs
 * and keep only the fields it documents.
 */
type Json = Record<string, any>;

const TYPES: Record<string, string> = {
  string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY', object: 'OBJECT',
};
const NUMBER_FORMATS = new Set(['int32', 'int64', 'float', 'double']);
const MAX_DEPTH = 12;

function resolveRef(ref: string, root: Json): Json | undefined {
  if (!ref.startsWith('#/')) return undefined;
  return ref.slice(2).split('/').reduce<any>((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function convert(schema: unknown, root: Json, depth: number, seen: Set<string>): Json {
  if (!schema || typeof schema !== 'object' || depth > MAX_DEPTH) return { type: 'STRING' };
  let s = schema as Json;

  if (typeof s.$ref === 'string') {
    if (seen.has(s.$ref)) return { type: 'STRING' }; // recursive schema: Gemini can't express it
    const target = resolveRef(s.$ref, root);
    if (!target) return { type: 'STRING' };
    return convert({ ...target, description: s.description ?? target.description }, root, depth + 1, new Set(seen).add(s.$ref));
  }

  // allOf: merge object members into one schema.
  if (Array.isArray(s.allOf)) {
    const merged: Json = { ...s };
    delete merged.allOf;
    for (const part of s.allOf) {
      const p = (part?.$ref ? resolveRef(part.$ref, root) : part) as Json | undefined;
      if (!p) continue;
      merged.properties = { ...merged.properties, ...p.properties };
      merged.required = [...(merged.required ?? []), ...(p.required ?? [])];
      merged.type ??= p.type;
      merged.description ??= p.description;
    }
    s = merged;
  }

  // anyOf/oneOf: collapse "X or null" into nullable X; otherwise let Gemini take anyOf.
  const union = (s.anyOf ?? s.oneOf) as Json[] | undefined;
  if (Array.isArray(union)) {
    const nonNull = union.filter((u) => u?.type !== 'null');
    const nullable = nonNull.length !== union.length;
    if (nonNull.length === 1) {
      return { ...convert({ ...nonNull[0], description: s.description ?? nonNull[0].description }, root, depth + 1, seen), ...(nullable ? { nullable: true } : {}) };
    }
    if (nonNull.length > 1) {
      return {
        anyOf: nonNull.map((u) => convert(u, root, depth + 1, seen)),
        ...(s.description ? { description: String(s.description) } : {}),
        ...(nullable ? { nullable: true } : {}),
      };
    }
  }

  let type: string | undefined = Array.isArray(s.type) ? s.type.find((t: string) => t !== 'null') : s.type;
  let nullable = Array.isArray(s.type) && s.type.includes('null');
  if (s.nullable === true) nullable = true;
  if (!type) type = s.properties ? 'object' : s.items ? 'array' : 'string';

  const out: Json = { type: TYPES[type] ?? 'STRING' };
  if (typeof s.description === 'string' && s.description) out.description = s.description;
  if (nullable) out.nullable = true;

  const enumValues = s.enum ?? (s.const !== undefined ? [s.const] : undefined);
  if (Array.isArray(enumValues) && enumValues.length) {
    out.type = 'STRING';
    out.enum = enumValues.map(String);
  }

  if (out.type === 'OBJECT') {
    const props = s.properties && typeof s.properties === 'object' ? s.properties : {};
    const entries = Object.entries(props).map(([k, v]) => [k, convert(v, root, depth + 1, seen)] as const);
    if (entries.length) out.properties = Object.fromEntries(entries);
    const required = (Array.isArray(s.required) ? s.required : []).filter((r: string) => r in props);
    if (required.length) out.required = [...new Set(required)];
  } else if (out.type === 'ARRAY') {
    out.items = convert(s.items ?? { type: 'string' }, root, depth + 1, seen);
    if (Number.isInteger(s.minItems)) out.minItems = String(s.minItems);
    if (Number.isInteger(s.maxItems)) out.maxItems = String(s.maxItems);
  } else if (out.type === 'STRING') {
    if (!out.enum && s.format === 'date-time') out.format = 'date-time';
    if (Number.isInteger(s.minLength)) out.minLength = String(s.minLength);
    if (Number.isInteger(s.maxLength)) out.maxLength = String(s.maxLength);
  } else if (out.type === 'NUMBER' || out.type === 'INTEGER') {
    if (NUMBER_FORMATS.has(s.format)) out.format = s.format;
    if (typeof s.minimum === 'number') out.minimum = s.minimum;
    if (typeof s.maximum === 'number') out.maximum = s.maximum;
  }
  return out;
}

/** Returns the `parameters` schema, or undefined for a tool that takes no arguments. */
export function toGeminiParameters(inputSchema: unknown): Json | undefined {
  const converted = convert(inputSchema, (inputSchema ?? {}) as Json, 0, new Set());
  if (converted.type !== 'OBJECT' || !converted.properties) return undefined; // Gemini rejects empty OBJECT schemas
  return converted;
}

export function toFunctionDeclaration(tool: { name: string; description: string; parameters: unknown }) {
  const parameters = toGeminiParameters(tool.parameters);
  return { name: tool.name, description: tool.description.slice(0, 1024), ...(parameters ? { parameters } : {}) };
}
