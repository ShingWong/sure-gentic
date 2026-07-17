import type { ToolDefinition, ToolParameter } from './types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  validatedParams: Record<string, unknown>;
}

export function validateParameters(tool: ToolDefinition, params: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const validatedParams: Record<string, unknown> = {};

  for (const param of tool.parameters) {
    const value = params[param.name];
    if (value === undefined || value === null) {
      if (param.required) {
        errors.push({ field: param.name, message: `${param.name} is required` });
      } else if (param.default !== undefined) {
        validatedParams[param.name] = param.default;
      }
      continue;
    }
    const typeError = validateType(param, value);
    if (typeError) {
      errors.push({ field: param.name, message: typeError });
      continue;
    }
    if (param.enum && !param.enum.includes(value as string)) {
      errors.push({ field: param.name, message: `Must be one of: ${param.enum.join(', ')}` });
      continue;
    }
    validatedParams[param.name] = value;
  }

  return { isValid: errors.length === 0, errors, validatedParams };
}

function validateType(param: ToolParameter, value: unknown): string | null {
  const expected = param.type;
  if (expected === 'array') {
    if (!Array.isArray(value)) return `${param.name} must be an array`;
    return null;
  }
  if (expected === 'number') {
    if (typeof value !== 'number' || isNaN(value)) return `${param.name} must be a number`;
    return null;
  }
  if (typeof value !== expected) {
    return `${param.name} must be of type ${expected}, got ${typeof value}`;
  }
  return null;
}
