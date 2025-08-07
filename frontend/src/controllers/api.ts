// api.ts

import axios from 'axios';

import { ChatEntry } from '../types'; // adjust the path as needed

export interface AskChatGptResponse {
  answer: string;
  sourceEntries: ChatEntry[];
}

export async function askChatGpt(
  question: string,
  projectId?: string
): Promise<AskChatGptResponse> {
  try {
    const response = await axios.post('/api/v1/ask-chatgpt', {
      question,
      ...(projectId ? { projectId } : {})
    });

    return {
      answer: response.data.answer || 'No answer returned.',
      sourceEntries: response.data.sourceEntries || [],
    };
  } catch (error) {
    console.error('Error calling /api/ask-chatgpt:', error);
    throw new Error('Failed to get response from ChatGPT.');
  }
}
