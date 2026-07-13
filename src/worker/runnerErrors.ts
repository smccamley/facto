const messageFromValue = (value: unknown) => {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return "Unknown runner error";
};

export const formatRunnerError = (error: unknown) => {
  const message = messageFromValue(error).trim();
  return message || "Unknown runner error";
};

const requestPath = (url: string) => {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return url;
    }

    return parsedUrl.pathname;
  } catch {
    return url;
  }
};

const readableResponseBody = (body: string) => {
  if (!body) {
    return "";
  }

  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    const message = typeof parsed.error === "string" ? parsed.error : parsed.message;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  } catch {
    return body;
  }

  return body;
};

export const formatHttpError = async (response: Response, options: { method?: string; url: string }) => {
  const method = options.method ?? "GET";
  const path = requestPath(options.url);
  const body = readableResponseBody((await response.text()).trim());
  const bodyMessage = body ? ` ${body.slice(0, 500)}` : "";

  return `Facto service request failed: ${method} ${path} returned HTTP ${response.status}.${bodyMessage}`;
};

export const formatRequestFailure = (error: unknown, options: { method?: string; url: string; attempts: number }) => {
  const method = options.method ?? "GET";
  const path = requestPath(options.url);
  return `Facto service request failed: ${method} ${path} could not connect after ${options.attempts} attempts. ${formatRunnerError(error)}`;
};
