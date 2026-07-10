import { existsSync, readFileSync } from "node:fs";

const parseValue = (value: string) => {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
};

const loadFile = (path: string) => {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmedLine.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    const value = parseValue(trimmedLine.slice(equalsIndex + 1));

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

export const loadFactoEnv = (defaultPaths: string[]) => {
  if (process.env.FACTO_ENV_FILE) {
    loadFile(process.env.FACTO_ENV_FILE);
    return;
  }

  for (const path of defaultPaths) {
    loadFile(path);
  }
};
