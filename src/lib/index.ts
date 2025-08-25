 /**
   * Truncate text to a given maximum length and add "..." if trimmed
   * @param text The input text
   * @param maxLength Maximum number of characters
   * @returns Truncated text
   */
  export function truncateText(text: string, maxLength: number = 20): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  }