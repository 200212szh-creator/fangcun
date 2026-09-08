export function digitsOnly(input: string) {
  return input.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isbn10To13(input: string) {
  const value = digitsOnly(input);
  if (value.length !== 10 || !isValidISBN10(value)) return null;
  const core = `978${value.slice(0, 9)}`;
  const checksum = core.split("").reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${core}${(10 - (checksum % 10)) % 10}`;
}

export function isbn13To10(input: string) {
  const value = digitsOnly(input);
  if (value.length !== 13 || !isValidISBN13(value) || !value.startsWith("978")) return null;
  const core = value.slice(3, 12);
  const checksum = core.split("").reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
  const remainder = 11 - (checksum % 11);
  return `${core}${remainder === 10 ? "X" : remainder === 11 ? "0" : remainder}`;
}

export function isValidISBN10(input: string) {
  const value = digitsOnly(input);
  if (value.length !== 10) return false;
  return value.split("").reduce((sum, digit, index) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0;
}

export function isValidISBN13(input: string) {
  const value = digitsOnly(input);
  if (value.length !== 13 || !/^\d{13}$/.test(value)) return false;
  return value.split("").reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0) % 10 === 0;
}

export function normalizeISBN(input?: string | null) {
  if (!input) return null;
  const value = digitsOnly(input);
  if (value.length === 13 && isValidISBN13(value)) return { isbn13: value, isbn10: isbn13To10(value) ?? undefined };
  if (value.length === 10 && isValidISBN10(value)) return { isbn13: isbn10To13(value) ?? undefined, isbn10: value };
  return null;
}
