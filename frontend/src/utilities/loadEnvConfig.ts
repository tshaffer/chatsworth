export async function loadEnvConfig(): Promise<void> {
  const response = await fetch('/env-config.json');
  const config = await response.json();
  (window as any).__ENV__ = config;
}
