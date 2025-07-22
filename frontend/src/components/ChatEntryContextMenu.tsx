// components/ChatEntryContextMenu.tsx
import React from 'react';
import { Menu, MenuItem } from '@mui/material';

interface ChatEntryContextMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onMoveToAnotherChat: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

const ChatEntryContextMenu: React.FC<ChatEntryContextMenuProps> = ({
  anchorEl,
  onClose,
  onMoveToAnotherChat,
  onDelete,
  onEdit,
}) => {
  const open = Boolean(anchorEl);

  return (
    <Menu open={open} anchorEl={anchorEl} onClose={onClose}>
      <MenuItem
        onClick={() => {
          onEdit();
          onClose();
        }}
      >
        Edit Prompt Summary
      </MenuItem>
      <MenuItem
        onClick={() => {
          onMoveToAnotherChat();
          onClose();
        }}
      >
        Move to Another Chat…
      </MenuItem>
      <MenuItem
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Delete
      </MenuItem>
    </Menu>
  );
};

export default ChatEntryContextMenu;
