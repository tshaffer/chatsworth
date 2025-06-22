import ReactMarkdown from 'react-markdown';
import { ChatEntry } from '../types';

export interface ChatViewerProps  {
  chatEntries: ChatEntry[];
}

const ChatViewer = (props: ChatViewerProps) => {

  return (
    <div>
      <h1>Chat Entries</h1>
      {props.chatEntries.map((entry, index) => (
        <div key={index} style={{ marginBottom: '2em' }}>
          <h3>Prompt:</h3>
          <ReactMarkdown>{entry.prompt}</ReactMarkdown>
          <h3>Response:</h3>
          <ReactMarkdown>{entry.response}</ReactMarkdown>
        </div>
      ))}
    </div>
  );
};

export default ChatViewer;
