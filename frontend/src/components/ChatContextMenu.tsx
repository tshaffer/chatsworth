// components/ChatContextMenu.tsx
import React from 'react';
import { Menu, MenuItem } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '../redux/store';
import { RootState } from '../redux/store';
import {
  deleteChat,
  persistReorderedChats,
} from '../redux/projectsSlice';

interface ChatContextMenuProps {
  anchorEl: HTMLElement | null;
  context: {
    chatId: string;
    projectId: string;
    index: number;
    total: number;
  } | null;
  onClose: () => void;
  onRename: (chatId: string, title: string) => void;
  onMoveToProject: (chatId: string, projectId: string) => void;
}

const ChatContextMenu: React.FC<ChatContextMenuProps> = ({
  anchorEl,
  context,
  onClose,
  onRename,
  onMoveToProject,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const projects = useSelector((state: RootState) => state.projects.projectList);

  const project = context ? projects.find(p => p.id === context.projectId) : undefined;

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{ root: { disableRestoreFocus: true } }}  // MUI v5+
      MenuListProps={{ autoFocusItem: false }}
    >
      <MenuItem
        disabled={!context || context.index === 0}
        onClick={() => {
          if (!context || !project) return;
          const newOrder = [...project.chats];
          const { index } = context;
          [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
          dispatch(persistReorderedChats({ projectId: project.id, newOrder: newOrder.map(c => c.id) }));
          onClose();
        }}
      >
        Move Up
      </MenuItem>

      <MenuItem
        disabled={!context || context.index === (context.total - 1)}
        onClick={() => {
          if (!context || !project) return;
          const newOrder = [...project.chats];
          const { index } = context;
          [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
          dispatch(persistReorderedChats({ projectId: project.id, newOrder: newOrder.map(c => c.id) }));
          onClose();
        }}
      >
        Move Down
      </MenuItem>

      <MenuItem
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!context || !project) return;
          const chat = project.chats.find(c => c.id === context.chatId);
          if (chat) onRename(context.chatId, chat.title);
          // Defer close so the input can mount and take focus first
          requestAnimationFrame(() => onClose());
        }}
      >
        Rename
      </MenuItem>
      
      <MenuItem
        onClick={() => {
          if (!context) return;
          const chat = project?.chats.find(c => c.id === context.chatId);
          if (chat && confirm(`Delete chat "${chat.title}"?`)) {
            dispatch(deleteChat({ chatId: context.chatId, projectId: context.projectId }));
          }
          onClose();
        }}
      >
        Delete
      </MenuItem>

      <MenuItem
        onClick={() => {
          if (context) {
            onMoveToProject(context.chatId, context.projectId);
            onClose();
          }
        }}
      >
        Move to Project
      </MenuItem>
    </Menu>
  );
};

export default ChatContextMenu;
