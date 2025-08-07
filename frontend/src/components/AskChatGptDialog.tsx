import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  Typography,
} from '@mui/material';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { askChatGpt, AskChatGptResponse } from '../controllers/api';
import { ChatEntry } from '../types';

interface AskChatGptDialogProps {
  open: boolean;
  onClose: () => void;
  onShowMatches: (entries: ChatEntry[]) => void;
}

const AskChatGptDialog: React.FC<AskChatGptDialogProps> = ({ open, onClose, onShowMatches }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sourceEntries, setSourceEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedProjectId = null;
  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    setSourceEntries([]);
    try {
      const result: AskChatGptResponse = await askChatGpt(question.trim(), selectedProjectId || undefined);
      setAnswer(result.answer);
      setSourceEntries(result.sourceEntries);
    } catch (err) {
      setAnswer('An error occurred while getting the answer.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setQuestion('');
    setAnswer('');
    setSourceEntries([]);
    setLoading(false);
    onClose();
  };

  const handleShowMatches = () => {
    onShowMatches(sourceEntries);
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Ask ChatGPT</DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth
          label="Your question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          multiline
          minRows={2}
          maxRows={6}
        />

        {loading && <CircularProgress sx={{ mt: 2 }} />}

        {!loading && answer && (
          <Typography variant="body1" sx={{ mt: 3, whiteSpace: 'pre-wrap' }}>
            {answer}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {sourceEntries.length > 0 && (
          <Button onClick={handleShowMatches} disabled={loading} color="secondary">
            Show Matching ChatEntries
          </Button>
        )}
        <Button onClick={handleClose} disabled={loading}>Close</Button>
        <Button onClick={handleSubmit} disabled={loading || !question.trim()} variant="contained">
          Ask
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AskChatGptDialog;
