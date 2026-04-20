const ABSOLUTE_URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>]+/gi;

export const redactBaseUrls = (message: string, baseUrls: string[]): string => {
  let output = message.replace(ABSOLUTE_URL_PATTERN, '[hidden]');
  for (const baseUrl of [...new Set(baseUrls.map((value) => value.trim()).filter(Boolean))]) {
    output = output.split(baseUrl).join('[hidden]');
    try {
      output = output.split(new URL(baseUrl).host).join('[hidden]');
    } catch {
      // ignore malformed url
    }
  }
  return output;
};
