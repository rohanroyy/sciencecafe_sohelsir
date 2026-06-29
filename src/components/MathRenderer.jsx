import React from 'react';
import katex from 'katex';

/**
 * Helper to check if a string is a valid JSON.
 */
const safeParseJSON = (str) => {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return null;
  }
};

/**
 * Component to render text with KaTeX equations.
 * Delimiters supported:
 * - Block: $$equation$$
 * - Inline: $equation$
 */
export const LatexRenderer = ({ text = '' }) => {
  if (!text) return null;

  // Split text by block and inline math delimiters
  // Match $$...$$ or $...$
  const tokens = String(text).split(/(\$\$.*?\$\$|\$.*?\$)/g);

  return (
    <span>
      {tokens.map((token, idx) => {
        if (token.startsWith('$$') && token.endsWith('$$')) {
          const formula = token.slice(2, -2);
          try {
            const html = katex.renderToString(formula, { displayMode: true, throwOnError: false });
            return <div key={idx} dangerouslySetInnerHTML={{ __html: html }} style={{ margin: '0.5rem 0' }} />;
          } catch (e) {
            console.error('KaTeX Error:', e);
            return <span key={idx}>{token}</span>;
          }
        } else if (token.startsWith('$') && token.endsWith('$')) {
          const formula = token.slice(1, -1);
          try {
            const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
            return <span key={idx} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch (e) {
            console.error('KaTeX Error:', e);
            return <span key={idx}>{token}</span>;
          }
        }
        return <span key={idx}>{token}</span>;
      })}
    </span>
  );
};

export default function MathRenderer({ content }) {
  if (!content) return null;

  // If content is a direct object
  if (typeof content === 'object') {
    const { text, image } = content;
    return (
      <div className="flex flex-col gap-2 align-start">
        {text && <LatexRenderer text={text} />}
        {image && (
          <div className="image-renderer mt-2">
            <img 
              src={image} 
              alt="Question Visual" 
              style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px', objectFit: 'contain' }} 
            />
          </div>
        )}
      </div>
    );
  }

  // If content is a string, check if it's stringified JSON
  const parsed = safeParseJSON(content);
  if (parsed) {
    return (
      <div className="flex flex-col gap-2 align-start">
        {parsed.text && <LatexRenderer text={parsed.text} />}
        {parsed.image && (
          <div className="image-renderer mt-2">
            <img 
              src={parsed.image} 
              alt="Question Visual" 
              style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px', objectFit: 'contain' }} 
            />
          </div>
        )}
      </div>
    );
  }

  // Otherwise, treat as simple string containing potential LaTeX
  return <LatexRenderer text={content} />;
}
