// components/MoveChatEntryDialog.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { Chat } from '../types';
import { useSelector } from 'react-redux';
import { RootState, selectProjectIdByChatId } from '../redux';

interface MoveChatEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetProjectId: string, targetChatId: string) => void;
  availableChats: Chat[];
  currentChatId: string;
}

const MoveChatEntryDialog: React.FC<MoveChatEntryDialogProps> = ({
  open,
  onClose,
  onConfirm,
  availableChats,
  currentChatId,
}) => {
  // const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const selectedProjectId = useSelector((state: RootState) =>
      selectedChatId ? selectProjectIdByChatId(state, selectedChatId) : null
  );

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Select Target Chat</DialogTitle>
      <DialogContent>
        <List>
          {availableChats
            .filter((chat) => chat.id !== currentChatId)
            .map((chat) => (
              <ListItemButton
                key={chat.id}
                selected={selectedChatId === chat.id}
                onClick={() => handleSelectChat(chat.id)}
              >
                <ListItemText primary={chat.title} />
              </ListItemButton>
            ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => selectedChatId && onConfirm(selectedProjectId!, selectedChatId)}
          disabled={!selectedChatId}
        >
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MoveChatEntryDialog;
