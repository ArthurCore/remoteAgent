const [urlValue, timeoutValue = "60000"] = process.argv.slice(2);

if (!urlValue) {
  throw new Error("usage: node scripts/wait-for-url.mjs <url> [timeout-ms]");
}

const url = new URL(urlValue);
const timeoutMs = Number.parseInt(timeoutValue, 10);
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error("timeout must be a positive integer");
}

const deadline = Date.now() + timeoutMs;
let lastResult = "no response";
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      console.log(`ready: ${url.href} (${response.status})`);
      process.exit(0);
    }
    lastResult = `HTTP ${response.status}`;
  } catch (error) {
    lastResult = error instanceof Error ? error.message : "request failed";
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

throw new Error(`timed out waiting for ${url.href}: ${lastResult}`);
