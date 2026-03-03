/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import { execSync } from 'child_process';
import { hostname } from 'os';

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
    throw new Error(`${input}: ${response.status} - ${response.statusText}.`);
  }
  return response.json();
}

let computerName = '';
export function getComputerName() {
  if (computerName) {
    return computerName;
  }

  switch (process.platform) {
    case 'win32':
      computerName = execSync('hostname').toString().trim() || hostname();
      return computerName;
    case 'darwin':
      computerName =
        execSync('scutil --get ComputerName').toString().trim() || hostname();
      return computerName;
    case 'linux':
      computerName =
        execSync('hostnamectl --pretty').toString().trim() || hostname();
      return computerName;
    default:
      computerName = hostname();
      return computerName;
  }
}
