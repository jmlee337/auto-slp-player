/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

export async function wrappedFetch(input: URL | RequestInfo) {
  let response: Response | undefined;
  try {
    response = await fetch(input);
  } catch {
    throw new Error('***You may not be connected to the internet***');
  }

  if (!response.ok) {
    throw new Error(`${response.status} - ${response.statusText}.`);
  }
  return response.json();
}
