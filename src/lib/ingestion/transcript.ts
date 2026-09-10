const DEFAULT_CHUNK_SIZE = 12_000;

const splitLongParagraph = (paragraph: string, maxCharacters: number): string[] => {
  const words = paragraph.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxCharacters) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

export const splitTranscript = (
  transcript: string,
  maxCharacters = DEFAULT_CHUNK_SIZE
): string[] => {
  const paragraphs = transcript
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const paragraphParts =
      paragraph.length > maxCharacters ? splitLongParagraph(paragraph, maxCharacters) : [paragraph];

    for (const part of paragraphParts) {
      const candidate = current ? `${current}\n\n${part}` : part;
      if (current && candidate.length > maxCharacters) {
        chunks.push(current);
        current = part;
      } else {
        current = candidate;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
};
