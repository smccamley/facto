const secretNamePattern = /(TOKEN|PASSWORD|SECRET|KEY|APPLE_ID)/i;

export const createRedactor = (environment: NodeJS.ProcessEnv) => {
  const secretValues = Object.entries(environment)
    .filter(([name, value]) => secretNamePattern.test(name) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => String(value));

  return (line: string) => {
    let redactedLine = line;

    for (const secretValue of secretValues) {
      redactedLine = redactedLine.replaceAll(secretValue, "[redacted]");
    }

    return redactedLine.replace(/[A-Za-z0-9_-]{48,}/g, "[redacted-token]");
  };
};
