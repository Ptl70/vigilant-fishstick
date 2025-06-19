
import React from 'react';
import { WebSource } from '../types';

interface SourceLinkDisplayProps {
  sources: WebSource[];
  isUserMessage?: boolean; // To adjust link colors if needed
}

const SourceLinkDisplay: React.FC<SourceLinkDisplayProps> = ({ sources, isUserMessage = false }) => {
  if (!sources || sources.length === 0) {
    return null;
  }

  // User message links can be distinct, bot links should match general markdown link style for consistency
  const linkColor = isUserMessage 
    ? 'text-blue-200 hover:text-blue-100 visited:text-blue-300' 
    : 'text-blue-400 hover:text-blue-300 visited:text-purple-400'; // Adjusted bot links to match markdown 'a'

  return (
    <ul className="space-y-1 text-sm">
      {sources.map((source, index) => (
        <li key={index} className="truncate">
          <a
            href={source.uri}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className={`${linkColor} hover:underline`}
          >
            {index + 1}. {source.title || source.uri}
          </a>
        </li>
      ))}
    </ul>
  );
};

export default SourceLinkDisplay;
