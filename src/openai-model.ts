export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function getOpenAIModelName(envVarName: string): string {
  const configuredValue = process.env[envVarName]?.trim();

  if (!configuredValue) {
    return DEFAULT_OPENAI_MODEL;
  }

  return configuredValue;
}
