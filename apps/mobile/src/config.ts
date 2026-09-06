/** Build-time configuration, injected by EAS environment variables (EXPO_PUBLIC_*). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const CF_ACCESS_CLIENT_ID = process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_ID ?? "";
export const CF_ACCESS_CLIENT_SECRET = process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET ?? "";

export const isConfigured = Boolean(API_URL && CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET);
