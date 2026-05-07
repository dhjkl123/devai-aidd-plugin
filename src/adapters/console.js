export function createConsoleAdapter() {
  return {
    log: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
  };
}
