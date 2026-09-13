/** Build-time configuration, injected by EAS environment variables (EXPO_PUBLIC_*). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const isConfigured = Boolean(API_URL);
