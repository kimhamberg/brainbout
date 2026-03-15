/** Assert a value is not `undefined`. Throws at runtime if it is. */
export function defined<T>(value: T | undefined, msg = "unexpected undefined"): T {
  if (value === undefined) throw new Error(msg);
  return value;
}
