import { Button } from "@mui/material";
import { useEffect, useState } from "react";
import { useDispatch } from 'react-redux';
import axios from 'axios';

import { ParsedMarkdown, Project } from "../types";
import ImportFromDriveDialog from "./ImportFromDriveDialog";
import ChatViewer from "./ChatViewer";

import { setParsedMarkdown } from '../redux/parsedMarkdownSlice';

const AppShell = () => {
  const dispatch = useDispatch();

  const [showImportMarkdownDialog, setShowImportMarkdownDialog] = useState(false);

  const handleSetParsedMarkdown = (parsedMarkdown: ParsedMarkdown) => {
    dispatch(setParsedMarkdown(parsedMarkdown));
  };

  const handleCloseMarkdownDialog = () => {
    setShowImportMarkdownDialog(false);
  };

          // const projects = response.data;
        // const parsedMarkdown: ParsedMarkdown = { projects };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get<Project[]>('/api/v1/projects');
        const parsedMarkdown: ParsedMarkdown = (response.data as any).projects as ParsedMarkdown;
        dispatch(setParsedMarkdown(parsedMarkdown));
      } catch (error) {
        console.error('Error loading projects:', error);
      }
    };

    fetchProjects();
  }, [dispatch]);

  return (
    <div>
      <h1>Chatsworth</h1>
      <Button onClick={() => setShowImportMarkdownDialog(true)}>
        Import Markdown
      </Button>
      <ImportFromDriveDialog
        open={showImportMarkdownDialog}
        onSetParsedMarkdown={handleSetParsedMarkdown}
        onClose={handleCloseMarkdownDialog}
      />
      <ChatViewer />
    </div>
  );
};

export default AppShell;
