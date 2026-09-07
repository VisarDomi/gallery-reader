let referrer = '';
export function setPageReferrer(value: string): void { referrer = value; }
export function pageReferrer(): string | undefined { return referrer || undefined; }
