import ReactMarkdown from 'react-markdown';
import { ChatEntry, ParsedMarkdown } from '../types';

export interface ChatViewerProps  {
  parsedMarkdown: ParsedMarkdown;
}

const ChatViewer = (props: ChatViewerProps) => {

  console.log('ChatViewer props:', props);

  return (
    <div>
      <h1>Chat Entries</h1>
      {props.parsedMarkdown.chatEntries.map((entry, index) => (
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
