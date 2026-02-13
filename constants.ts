const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || '';

export const APP_URL = rawAppUrl.endsWith('/') && rawAppUrl !== '/'
  ? rawAppUrl.slice(0, -1)
  : rawAppUrl;