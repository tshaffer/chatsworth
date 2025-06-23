import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ParsedMarkdown, Project, Chat, ChatEntry } from '../types';

export interface ChatViewerProps {
  parsedMarkdown: ParsedMarkdown;
}

const ChatViewer = ({ parsedMarkdown }: ChatViewerProps) => {
  if (!parsedMarkdown.projects || parsedMarkdown.projects.length === 0) {
    return <div>No chat data loaded.</div>;
  }

  return (
    <div>
      <h1>Projects</h1>
      {parsedMarkdown.projects.map((project: Project) => (
        <div key={project.id} style={{ marginBottom: '2rem' }}>
          <h2>Project: {project.name}</h2>
          {project.chats.map((chat: Chat) => (
            <div key={chat.id} style={{ marginLeft: '1rem', marginBottom: '1.5rem' }}>
              <h3>Chat: {chat.title}</h3>
              {chat.entries.map((entry: ChatEntry, index: number) => (
                <div key={index} style={{ marginLeft: '1rem', marginBottom: '1em' }}>
                  <strong>Prompt:</strong>
                  <ReactMarkdown>{entry.prompt}</ReactMarkdown>
                  <strong>Response:</strong>
                  <ReactMarkdown>{entry.response}</ReactMarkdown>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ChatViewer;
