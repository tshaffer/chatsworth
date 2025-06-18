const errorTypesToDisable = [
  'Warning: Unknown event handler property',
  'Warning: React does not recognize the',
];

const errorVariableNamesInErrorMessagesToDisable = [
  'keywordsAsTree',
  'keywordNodesByNodeId',
  'onUpdateKeywordAssignedToSelectedMediaItems',
  'selectedMediaItemIds',
  'mapKeywordNodeIdToSelectedMediaItemIds',
];

const stringIncludesAny = (str: string, arr: string[]): boolean => {
  return arr.some(item => str.includes(item));
};

// Save original console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export const initializeDiagnostics = () => {

  // Override console methods
  console.error = (...args) => {

    // Check if the error message is from React
    if (args.some(arg => arg
      && typeof arg === 'string'
      // && arg.startsWith('Warning: React does not recognize the'))
      && stringIncludesAny(arg, errorTypesToDisable))
    ) {
      if (args.some(arg => arg
        && typeof arg === 'string'
        && stringIncludesAny(arg, errorVariableNamesInErrorMessagesToDisable))
      )
        // Suppress specific React warnings
        return;
    }
    // For other errors, log them normally
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args) => {
    // Check if the warning message is from React
    // if (args.some(arg => arg && typeof arg === 'string' && arg.includes('Warning:'))) {
    //   // Suppress React warnings
    //   return;
    // }
    // For other warnings, log them normally
    originalConsoleWarn.apply(console, args);
  };
};

export default initializeDiagnostics;


