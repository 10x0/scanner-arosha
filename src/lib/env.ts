export const TZ = process.env.APP_TIMEZONE || 'Europe/London';
export const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'example.com';
export const usernameToEmail = (username: string) => `${username}@${EMAIL_DOMAIN}`;
export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;
