/**
 * Safely evaluates a simple math equation string and returns a number.
 * Supports +, -, *, /, (, ), and decimals.
 */
export const evaluateEquation = (input: string): number => {
  if (!input) return 0;
  
  // Remove commas and other non-math characters except numbers and operators
  const sanitized = input.replace(/,/g, "").replace(/[^0-9+\-*/(). ]/g, "");
  
  if (!sanitized || sanitized.trim() === "") return 0;

  try {
    // Check if it's just a number first for performance
    if (/^[0-9.]+$/.test(sanitized)) {
      return parseFloat(sanitized) || 0;
    }

    // Use Function constructor for a relatively safe evaluation of simple arithmetic
    // We've already sanitized the input to only allow math-related characters.
    const result = new Function(`return ${sanitized}`)();
    
    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
    return 0;
  } catch (error) {
    console.warn("Failed to evaluate equation:", sanitized, error);
    return 0;
  }
};
