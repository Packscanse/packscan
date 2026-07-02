// UPU S10: 2-letter service indicator + 8-digit serial + 1 check digit + 2-letter country code.
// Check digit = weighted mod-11 over the 8 serial digits; 11 - (sum % 11), with 10 → 0 and 11 → 5.
const S10_WEIGHTS = [8, 6, 4, 2, 3, 5, 9, 7];

export const S10_PATTERN = /^[A-Z]{2}(\d{8})(\d)([A-Z]{2})$/;

export function isValidS10(code: string): boolean {
  const match = S10_PATTERN.exec(code);
  if (!match) return false;
  const [, serial, checkDigitStr] = match;
  const sum = serial
    .split("")
    .reduce((acc, digit, i) => acc + Number(digit) * S10_WEIGHTS[i], 0);
  let expected = 11 - (sum % 11);
  if (expected === 10) expected = 0;
  if (expected === 11) expected = 5;
  return expected === Number(checkDigitStr);
}

/** Returns the 2-letter country suffix if the code is S10-shaped, else null. */
export function s10CountryCode(code: string): string | null {
  const match = S10_PATTERN.exec(code);
  return match ? match[3] : null;
}
