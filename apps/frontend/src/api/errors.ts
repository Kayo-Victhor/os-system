interface ZodFlatten {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

export function fieldErrorsFromDetails(
  details: unknown,
): Record<string, string> {
  const flat = details as ZodFlatten | undefined;
  const result: Record<string, string> = {};

  if (flat?.fieldErrors) {
    for (const [field, messages] of Object.entries(flat.fieldErrors)) {
      if (messages && messages.length > 0) {
        result[field] = messages[0];
      }
    }
  }

  return result;
}
