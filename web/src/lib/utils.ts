import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatModelName(id: string, ownedBy?: string) {
  if (!id) return "";
  const parts = id.split('/');
  const lastPart = parts[parts.length - 1];

  let provider = ownedBy || (parts.length > 1 ? parts[0] : '');
  if (provider) {
    provider = provider.charAt(0).toUpperCase() + provider.slice(1);
    return `${lastPart}`;
  }

  return lastPart;
}
